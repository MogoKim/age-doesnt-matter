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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { ClusterId, Intent, KeywordNode, PublishPolicy } from './keyword-research/scorer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UNIVERSE_PATH = path.resolve(__dirname, 'data/keyword-universe.json')
const PREVIEW_PATH = path.resolve(__dirname, 'data/keyword-queue-preview.dry-run.json')
const STATE_PATH = path.resolve(__dirname, 'data/keyword-queue-state.json')

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

/**
 * 공백·문장부호 제거 정규화 — DB 발행분 title/seoTitle과 큐 keyword를 띄어쓰기 차이에 무관하게 대조.
 * (extractSubtopicKey는 공백 기준이라 "빈 둥지 증후군" ≠ "빈둥지 증후군"을 놓침 → 이 함수로 보강)
 */
export function normalizeText(s: string): string {
  return (s ?? '').replace(/[^가-힣0-9a-z]/gi, '')
}

/** 큐 keyword의 핵심 subtopic — 앞 2토큰을 공백 제거 결합. DB 부분문자열 매칭용. */
export function keywordCore(keyword: string): string {
  return normalizeText(keyword.trim().split(/\s+/).slice(0, 2).join(''))
}

/**
 * brand-fit 제외 판정 — 우나어 타깃(40대 중반~60대 한국 여성)에 안 맞는 후보.
 * 보수적: 명백한 남성 중심(남편 제외) + 과도 broad만. borderline은 통과시킨다.
 */
export function brandFitExclusion(keyword: string): 'male_centric' | 'broad_community' | 'broad_health' | null {
  const k = keyword.trim()
  if (/(남자|남성)/.test(k) && !/남편/.test(k)) return 'male_centric'
  if (/커뮤니티/.test(k)) return 'broad_community'
  if (/^[456]0대\s*(여성\s*)?건강$/.test(k)) return 'broad_health'
  return null
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

// ─── 운영 state API (generator 연결용) ───────────────────────────────────────

export type QueueEvent =
  | 'published'
  | 'skipped_duplicate'
  | 'failed_generation'
  | 'failed_image'
  | 'failed_body_short'
  | 'failed_no_publish_guard'

export interface QueueCandidate {
  keyword: string
  normalized: string
  cluster: ClusterId | 'uncategorized'
  intent: Intent
  publishPolicy: PublishPolicy
  score: number
  subtopicKey: string
}

export interface QueueEventRow {
  ts: string
  event: QueueEvent
  keyword: string
  normalized: string
  cluster: string
  publishPolicy: PublishPolicy
  session?: string
  postId?: string
  note?: string
}

export interface QueueState {
  version: number
  updatedAt: string
  consumedNormalized: string[]
  counts: Record<QueueEvent, number>
  events: QueueEventRow[]
  /** [PR-1] normalized → 누적 실패 횟수. failed_generation/failed_body_short 1회 재시도 후 소비 판정용. */
  retryCount?: Record<string, number>
}

const MAX_EVENTS = 500

function emptyState(): QueueState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    consumedNormalized: [],
    counts: {
      published: 0,
      skipped_duplicate: 0,
      failed_generation: 0,
      failed_image: 0,
      failed_body_short: 0,
      failed_no_publish_guard: 0,
    },
    events: [],
    retryCount: {},
  }
}

export function loadUniverse(): KeywordNode[] {
  const u = JSON.parse(readFileSync(UNIVERSE_PATH, 'utf-8')) as { keywords: KeywordNode[] }
  return u.keywords
}

/** state 파일 로드 — 없거나 손상 시 빈 state 반환(읽기 실패가 발행을 막지 않음) */
export function loadState(): QueueState {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as Partial<QueueState>
    const base = emptyState()
    return {
      version: parsed.version ?? base.version,
      updatedAt: parsed.updatedAt ?? base.updatedAt,
      consumedNormalized: parsed.consumedNormalized ?? [],
      counts: { ...base.counts, ...(parsed.counts ?? {}) },
      events: parsed.events ?? [],
      retryCount: parsed.retryCount ?? {},
    }
  } catch {
    return emptyState()
  }
}

/**
 * state 저장 (data/ 디렉토리 보장, gitignore 대상). DB 아님.
 * [PR-1] 원자적 write(tmp→rename) + 저장 직전 디스크 consumed 병합 —
 *   launchd morning/late 세션이 겹쳐도 소비 이력 유실 방지(합집합), 중간 크래시 시 기존 파일 보존.
 */
export function saveState(state: QueueState): void {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  // 저장 직전 디스크 재로드 후 consumed 합집합 — 다른 세션이 그 사이 소비한 항목 보존
  try {
    const onDisk = JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as Partial<QueueState>
    if (Array.isArray(onDisk.consumedNormalized)) {
      const merged = new Set([...onDisk.consumedNormalized, ...state.consumedNormalized])
      state.consumedNormalized = [...merged]
    }
  } catch {
    // 파일 없음/손상 — 현재 state 그대로 기록
  }
  state.updatedAt = new Date().toISOString()
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS)
  const tmp = `${STATE_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, STATE_PATH) // POSIX rename = 원자적 교체
}

/** 소비 표시 (중복 추가 방지) */
export function markConsumed(state: QueueState, normalized: string): void {
  if (!state.consumedNormalized.includes(normalized)) state.consumedNormalized.push(normalized)
}

/** 이벤트 기록 (counts 증가 + events 추가) */
export function recordEvent(state: QueueState, row: Omit<QueueEventRow, 'ts'>): void {
  state.counts[row.event] = (state.counts[row.event] ?? 0) + 1
  state.events.push({ ts: new Date().toISOString(), ...row })
}

/**
 * [PR-1] 실패/성공 이벤트에 따른 소비 정책 — 반환 true면 markConsumed(재선택 방지) 대상.
 *  - published / skipped_duplicate / failed_no_publish_guard → 소비(재시도 무의미)
 *  - failed_image → 소비 안 함(키워드 무관 이미지 오류 → 다음 회차 재시도)
 *  - failed_generation / failed_body_short → 1회 재시도 후 소비(2번째 실패부터 소비 = 무한루프 방지)
 */
export function applyFailurePolicy(state: QueueState, normalized: string, event: QueueEvent): boolean {
  if (event === 'published' || event === 'skipped_duplicate' || event === 'failed_no_publish_guard') return true
  if (event === 'failed_image') return false
  if (event === 'failed_generation' || event === 'failed_body_short') {
    state.retryCount = state.retryCount ?? {}
    const next = (state.retryCount[normalized] ?? 0) + 1
    state.retryCount[normalized] = next
    return next >= 2 // 1회 재시도(첫 실패=false) → 2번째 실패부터 소비
  }
  return false
}

/**
 * 소비되지 않은 publishable 후보를 우선순위 순서로 반환.
 * (클러스터 라운드로빈 + subtopic 분산 = buildQueuePreview 순서 재사용, consumed 제외, 이중가드)
 */
export function selectOrderedCandidates(
  nodes: KeywordNode[],
  opts: {
    limit: number
    excludeNormalized: Set<string>
    /** [PR-1] 발행된 매거진 title/seoTitle 정규화 문자열 — keywordCore가 부분문자열이면 DB subtopic 중복으로 제외 */
    publishedNorms?: string[]
    /** [PR-1] brand-fit 필터(남성 중심·과도 broad 제외) 적용 여부 */
    applyBrandFit?: boolean
  },
): QueueCandidate[] {
  const byKeyword = new Map<string, KeywordNode>()
  for (const n of nodes) byKeyword.set(n.keyword, n)

  const publishableCount = nodes.filter((n) => PUBLISHABLE_POLICIES.includes(n.publishPolicy)).length
  const horizonDays = Math.ceil(publishableCount / SESSION_SLOTS.length) + 2
  const { rows } = buildQueuePreview(nodes, horizonDays)

  const publishedNorms = opts.publishedNorms ?? []
  let dbDupBlocked = 0
  let brandBlocked = 0

  const out: QueueCandidate[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const node = byKeyword.get(r.keyword)
    if (!node) continue
    if (seen.has(node.normalized)) continue
    if (opts.excludeNormalized.has(node.normalized)) continue
    // 이중 가드: publishable만 (no_publish 절대 제외)
    if (!PUBLISHABLE_POLICIES.includes(node.publishPolicy)) continue
    // [PR-1] DB subtopic 중복 가드 — 이미 발행된 매거진과 같은 subtopic이면 제외 (자기잠식 방지)
    if (publishedNorms.length > 0) {
      const core = keywordCore(node.keyword)
      if (core.length >= 5 && publishedNorms.some((p) => p.includes(core))) {
        dbDupBlocked++
        continue
      }
    }
    // [PR-1] brand-fit 제외 (남성 중심·과도 broad)
    if (opts.applyBrandFit && brandFitExclusion(node.keyword) !== null) {
      brandBlocked++
      continue
    }
    seen.add(node.normalized)
    out.push({
      keyword: node.keyword,
      normalized: node.normalized,
      cluster: node.cluster,
      intent: node.intent,
      publishPolicy: node.publishPolicy,
      score: node.score,
      subtopicKey: r.subtopicKey,
    })
    if (out.length >= opts.limit) break
  }
  if (publishedNorms.length > 0 || opts.applyBrandFit) {
    console.log(
      `[queue] forward-safety 제외 — DB subtopic 중복 ${dbDupBlocked}건 / brand-fit ${brandBlocked}건 → 최종 후보 ${out.length}개`,
    )
  }
  return out
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
