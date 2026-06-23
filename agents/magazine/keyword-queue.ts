/**
 * 매거진 발행 큐 — keyword-universe 기반 후보 선택 (1단계: dry-run 미리보기 전용)
 *
 * // LOCAL ONLY — cron/GHA/runner.ts 미등록. DB write 없음. 게시글 생성 없음.
 *                 magazine-generator 발행 경로에 아직 연결하지 않는다(미리보기만).
 *                 import 시 자동 실행 안 함(isMain 가드). `npx tsx ...keyword-queue.ts`로만 실행.
 *
 * 규칙:
 *  - publishPolicy ∈ {publish, publish_softened_title}만 큐 후보. no_publish_*는 절대 제외.
 *  - 클러스터 라운드로빈 + 클러스터 내 score desc.
 *  - 하루 2슬롯(morning/late = SESSION_TIME 환경값; 내부적으로 late→evening 정규화됨).
 *  - 소비 state 파일은 쓰지 않는다(dry-run preview JSON만).
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import type { ClusterId, KeywordNode, PublishPolicy } from './keyword-research/scorer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UNIVERSE_PATH = path.resolve(__dirname, 'data/keyword-universe.json')
const PREVIEW_PATH = path.resolve(__dirname, 'data/keyword-queue-preview.dry-run.json')

export const PUBLISHABLE_POLICIES: readonly PublishPolicy[] = ['publish', 'publish_softened_title']

/** 일일 다양성을 위한 클러스터 회전 순서 (민감 클러스터 인접 분산) */
export const CLUSTER_ROTATION: readonly ClusterId[] = [
  '갱년기건강',
  '외로움관계',
  '돈연금',
  '부부성건강',
  '일자리',
  '패션생활',
]

const SESSION_SLOTS = ['morning', 'late'] as const
type Session = (typeof SESSION_SLOTS)[number]

export interface QueueRow {
  dayOffset: number
  date: string
  session: Session
  keyword: string
  cluster: ClusterId | 'uncategorized'
  subtopicKey: string
  publishPolicy: PublishPolicy
  score: number
  category: string
}

export interface QueuePreviewResult {
  rows: QueueRow[]
  subtopicFallbacks: number
}

/**
 * subtopicKey 추출 — keyword의 앞 2개 토큰을 정규화해 같은 세부주제를 묶는다.
 *  - 토큰 분리 후 각 토큰의 꼬리 '층/들' 제거(중장년층→중장년)
 *  - 앞 2토큰 결합. 예) "국민연금 조기수령 신청방법" → "국민연금 조기수령",
 *    "갱년기 다이어트 식단" → "갱년기 다이어트", "중장년층 자격증" → "중장년 자격증"
 */
export function extractSubtopicKey(keyword: string): string {
  const tokens = keyword
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[층들]$/, ''))
    .filter(Boolean)
  return tokens.slice(0, 2).join(' ')
}

/** magazine-generator.ts detectCategory(title, reason)를 그대로 미러링한 예상 카테고리 */
function predictCategory(title: string, reason: string): string {
  const text = `${title} ${reason}`.toLowerCase()
  const financeFirst = [
    '건강보험', '건보', '피부양자', '보험료', '실손보험',
    '퇴직연금', 'irp', '연금저축', '세액공제', '노후자금',
    '재테크', '저축', '투자', '부동산',
  ]
  if (financeFirst.some((k) => text.includes(k))) return '재테크'
  const relation = ['연인', '부부', '황혼', '이성', '재혼', '연애', '외로움', '친구 사귀']
  if (relation.some((k) => text.includes(k))) return '관계'
  const map: Record<string, string[]> = {
    건강: ['건강', '운동', '관절', '영양', '수면', '병원', '치매', '혈압', '당뇨', '걷기', '갱년기'],
    재테크: ['재테크', '연금', '저축', '투자', '부동산', '노후', '퇴직연금'],
    은퇴준비: ['은퇴', '퇴직', '인생 2막', '2막', '노후 준비', '노후준비', '은퇴 준비'],
    일자리: ['일자리', '취업', '자격증', '봉사', '창업', '알바', '재취업', '파트타임'],
    생활: ['살림', '정리', '세탁', '절약', '생활', '꿀팁', '재활용'],
    여행: ['여행', '맛집', '산책', '둘레길', '관광', '기차', '드라이브'],
    문화: ['독서', '영화', '드라마', '음악', '전시', '공연', '문화'],
    요리: ['요리', '레시피', '반찬', '김치', '밑반찬', '제철', '장보기'],
  }
  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some((k) => text.includes(k))) return cat
  }
  return '생활'
}

function ymd(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000)
  return d.toISOString().slice(0, 10)
}

/**
 * 발행 후보를 클러스터 라운드로빈 + (클러스터 내) 서브토픽 분산으로 days×2슬롯 미리뽑기.
 *  - 클러스터 라운드로빈 유지(인접 슬롯 다른 클러스터)
 *  - 클러스터 내부: score desc 순회하되, 최근 avoidWindowSlots(기본 14슬롯=7일) 내 같은
 *    subtopicKey가 쓰였으면 건너뛰고 다음 후보 선택. 회피 가능한 후보가 없으면 top-score로
 *    fallback(= subtopicFallbacks 카운트). 후보 자체 부족 시에도 fallback.
 *  - 소비 state 미사용(순수 함수). publishPolicy 필터는 그대로 유지.
 */
export function buildQueuePreview(
  nodes: KeywordNode[],
  days: number,
  avoidWindowSlots = 14,
): QueuePreviewResult {
  const candidates = nodes.filter((n) => PUBLISHABLE_POLICIES.includes(n.publishPolicy))

  const byCluster = new Map<ClusterId | 'uncategorized', KeywordNode[]>()
  for (const c of CLUSTER_ROTATION) {
    byCluster.set(
      c,
      candidates.filter((n) => n.cluster === c).sort((a, b) => b.score - a.score),
    )
  }

  const usedKeywords = new Set<string>()
  const lastSubtopicSlot = new Map<string, number>()
  const rows: QueueRow[] = []
  let rot = 0
  let subtopicFallbacks = 0
  const totalSlots = days * SESSION_SLOTS.length

  for (let slot = 0; slot < totalSlots; slot++) {
    const dayOffset = Math.floor(slot / SESSION_SLOTS.length)
    const session = SESSION_SLOTS[slot % SESSION_SLOTS.length]

    let picked: KeywordNode | null = null
    let usedFallback = false

    for (let tries = 0; tries < CLUSTER_ROTATION.length; tries++) {
      const cluster = CLUSTER_ROTATION[rot % CLUSTER_ROTATION.length]
      rot++
      const list = byCluster.get(cluster) ?? []

      // 1순위: 미사용 + 최근 window 내 같은 subtopic 아님
      let candidate: KeywordNode | null = null
      let fallbackCandidate: KeywordNode | null = null
      for (const node of list) {
        if (usedKeywords.has(node.keyword)) continue
        if (!fallbackCandidate) fallbackCandidate = node // 미사용 top-score 보관(fallback)
        const sub = extractSubtopicKey(node.keyword)
        const last = lastSubtopicSlot.get(sub)
        if (last === undefined || slot - last >= avoidWindowSlots) {
          candidate = node
          break
        }
      }

      const chosen = candidate ?? fallbackCandidate
      if (chosen) {
        picked = chosen
        usedFallback = candidate === null // 회피 실패 → fallback
        break
      }
      // 이 클러스터는 후보 소진 → 다음 클러스터
    }

    if (!picked) break
    if (usedFallback) subtopicFallbacks += 1

    const sub = extractSubtopicKey(picked.keyword)
    usedKeywords.add(picked.keyword)
    lastSubtopicSlot.set(sub, slot)

    const reason = `${picked.cluster}/${picked.intent}`
    rows.push({
      dayOffset,
      date: ymd(dayOffset),
      session,
      keyword: picked.keyword,
      cluster: picked.cluster,
      subtopicKey: sub,
      publishPolicy: picked.publishPolicy,
      score: picked.score,
      category: predictCategory(picked.keyword, reason),
    })
  }
  return { rows, subtopicFallbacks }
}

function runPreview(): void {
  const universe = JSON.parse(readFileSync(UNIVERSE_PATH, 'utf-8')) as { keywords: KeywordNode[] }
  const { rows, subtopicFallbacks } = buildQueuePreview(universe.keywords, 14)

  // 안전 검증
  const leaked = rows.filter((r) => !PUBLISHABLE_POLICIES.includes(r.publishPolicy))
  console.log(`[queue] no_publish 누출: ${leaked.length}건 ${leaked.length === 0 ? '✅' : '❌'}`)

  // 표 출력
  console.log('[queue] === 14일치 dry-run 발행 큐 (28슬롯) ===')
  console.log('date | session | cluster | subtopicKey | publishPolicy | score | cat | keyword')
  for (const r of rows) {
    console.log(
      `${r.date} | ${r.session.padEnd(7)} | ${r.cluster.padEnd(6)} | ${r.subtopicKey.padEnd(14)} | ${r.publishPolicy.padEnd(22)} | ${r.score} | ${r.category} | ${r.keyword}`,
    )
  }

  // 분포·인접 반복 점검
  const clusterCount: Record<string, number> = {}
  let adjacentSameCluster = 0
  for (let i = 0; i < rows.length; i++) {
    clusterCount[rows[i].cluster] = (clusterCount[rows[i].cluster] ?? 0) + 1
    if (i > 0 && rows[i].cluster === rows[i - 1].cluster) adjacentSameCluster++
  }
  console.log('[queue] 클러스터 분포:', JSON.stringify(clusterCount))
  console.log(`[queue] 인접 슬롯 동일 클러스터 반복: ${adjacentSameCluster}건`)

  // 서브토픽 반복 지표
  const subCount: Record<string, number> = {}
  for (const r of rows) subCount[r.subtopicKey] = (subCount[r.subtopicKey] ?? 0) + 1
  const top10 = Object.entries(subCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log('[queue] subtopicKey TOP10:', JSON.stringify(top10))
  // 7일(14슬롯) 내 같은 subtopicKey 반복 건수
  let within7d = 0
  const lastSeen = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const prev = lastSeen.get(rows[i].subtopicKey)
    if (prev !== undefined && i - prev < 14) within7d++
    lastSeen.set(rows[i].subtopicKey, i)
  }
  console.log(`[queue] 7일 내 동일 subtopicKey 반복: ${within7d}건 / subtopic fallback: ${subtopicFallbacks}건`)

  writeFileSync(
    PREVIEW_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), days: 14, subtopicFallbacks, rows }, null, 2),
  )
  console.log(`[queue] preview 저장(gitignore): ${path.basename(PREVIEW_PATH)}`)
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runPreview()
}
