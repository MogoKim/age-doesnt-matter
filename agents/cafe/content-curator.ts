// LOCAL ONLY — 카페 콘텐츠 큐레이션은 크롤링 데이터 의존, 로컬 실행
/**
 * 콘텐츠 큐레이터
 * 카페 트렌드 분석 결과를 기반으로 우나어 페르소나가 쓸 글/댓글을 생성
 * 원본 복붙 X → 주제와 감정만 참고해 오리지널 콘텐츠 작성
 */
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack, sendSlackMessage } from '../core/notifier.js'
import { findPoliticalKeyword, hasPoliticalKeyword } from '../core/political-blocklist.js'
import { findAgeFitViolation } from '../core/age-fit-blocklist.js'
import { evaluateContentQualityWithHaiku, summarizeHaikuResult, resolveHaikuGateMode, shouldBlockPublish, recordHaikuBlocked, type HaikuQualityResult } from './haiku-quality-gate.js'
import type { CuratedContent } from './types.js'

import {
  type PersonaMatch,
  PERSONAS,
  DESIRE_PERSONA_MAP,
  matchPersona,
  resolveBoardFromRef,
  personaBoardForRouting,
  personaIdsForRoutingBoard,
  guessDesire,
  stripMarkdown,
  replaceCafeReferences,
  toCuratedHtmlContent,
  toCuratedSummary,
  type CommunityPublishBoardType,
  cleanCuratedTitle,
  cleanCuratedContent,
  hasPublishableBody,
} from './curator-shared.js'
import { getCuratorBotUser, countTodayPostsByPersona, AUTHOR_DAILY_POST_CAP } from './curator-users.js'
import { CURATION_CORE_CAFE_IDS, DLXOGNS01_ALLOWED_BOARDS, PUBLISHABLE_CAFE_IDS, PUBLISHABLE_ONLY_CAFE_IDS, SHADOW_CAFE_IDS, sourceStageOfCafe } from './config.js'
import { generateCommunitySlug } from '../core/slug.js'
import { computeUsableCount } from './compute-usable-count.js'
import { buildPopularSeoMeta } from './popular-seo.js'
import { findMedicalAdviceRequest } from '../core/medical-advice-blocklist.js'
import { buildDailyQuarantine, extractBlockedRefIds, type DailyQuarantine } from './curator-quarantine.js'
import { recordPersonaMatcherShadow } from './persona-matcher-shadow.js'

// ─── 후보 풀 / skipReason 타입 ─────────────────────────────────
type SkipReason =
  | 'DESIRE_EXHAUSTED'
  | 'KEYWORD_OVERLAP'
  | 'REFS_EMPTY'
  | 'HAIKU_BLOCKED' // PR-3 enforcement — 고신뢰 REJECT 차단 (mode=enforce에서만)
  | 'LOW_USABLE_COMMENTS'
  | 'AUTHOR_DAILY_CAP'
  | 'GENERATION_FAILED' // 세분화 불가한 잔여 실패 (아래 3종에 해당하지 않는 경우)
  | 'NO_MAIN_REF' // refs[0] 없음
  | 'EMPTY_TITLE_AFTER_CLEAN' // 정화 후 제목 0자
  | 'EMPTY_CONTENT_AFTER_CLEAN' // 정화 후 본문 0자 (카페 안내문만 있던 원문 등)
  | 'SEASON_MISMATCH'
  | 'DUPLICATE_TITLE'
  | 'PUBLISH_FAILED'
  | 'POLITICAL_BLOCK'
  | 'AGE_FIT_BLOCK'

interface CandidateTopic {
  topic: string
  // [Phase 1-b] 'publishable' = remon/goondae source-backed 보충 lane (production killer/trend가 항상 우선)
  source: 'killer' | 'trend' | 'publishable'
  cafePostId?: string
  postedAt?: Date
  killerScore?: number
  desireCategory?: string
}

// ─── source 편중 완화 정렬 (1차 실험 2026-07-28, 기본 OFF) ─────────────────
// 배경: killerScore 전역 desc 정렬 + remonterrace 고품질 재고 압도(7일 usedAt 63%)로
//   후보 상위가 특정 카페에 자연 독점되는 문제. 고정 % cap 대신 "같은 품질 밴드(10점)
//   안에서만" 최근 7일 발행 참조 점유율이 낮은 source를 먼저 세운다.
//   → 품질 순위(밴드 간)는 불변, floor(killerScore≥50·isUsable 등)도 불변.
//   플래그 off면 조회·정렬 모두 기존과 100% 동일(추가 쿼리 0).
const SOURCE_DIVERSITY_SORT = process.env.SOURCE_DIVERSITY_SORT === 'on'

/** 최근 7일 usedAt(발행 참조 소모) 기준 cafeId별 점유율(0~1) */
async function fetchUsedShare7d(): Promise<Map<string, number>> {
  const grouped = await prisma.cafePost.groupBy({
    by: ['cafeId'],
    where: { usedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
    _count: true,
  })
  const total = grouped.reduce((s, g) => s + g._count, 0)
  const map = new Map<string, number>()
  if (total === 0) return map
  for (const g of grouped) map.set(g.cafeId, g._count / total)
  return map
}

/**
 * 같은 killerScore 10점 밴드 안에서만 저점유 cafeId 우선.
 * 정렬 키: 밴드 desc → 7일 점유율 asc → killerScore desc (밴드 간 품질 순위 불훼손)
 */
function applyDiversitySort<T extends { killerScore: number | null; cafeId: string }>(
  rows: T[],
  usedShare: Map<string, number>,
): T[] {
  return [...rows].sort((a, b) => {
    const bandA = Math.floor((a.killerScore ?? 0) / 10)
    const bandB = Math.floor((b.killerScore ?? 0) / 10)
    if (bandA !== bandB) return bandB - bandA
    const shareA = usedShare.get(a.cafeId) ?? 0
    const shareB = usedShare.get(b.cafeId) ?? 0
    if (shareA !== shareB) return shareA - shareB
    return (b.killerScore ?? 0) - (a.killerScore ?? 0)
  })
}

/** [ref 계측 2026-07-29] 발행 원문이 선택된 fallback stage — 관측 전용 */
type RefStage = 's1' | 's2' | 's3' | 's4' | 'self'
interface RefMetrics {
  refStage: RefStage
  refPoolSize: number
  refCandidateSourceCounts: Record<string, number>
}

interface TopicResult extends CandidateTopic {
  refsCount: number
  skipReason: SkipReason | null
  candidatesBeforeUsableFilter?: number
  maxUsableCount?: number
  requiredUsableCount?: number
  matchedKeyword?: string
  // [Phase 0-b] 실제 발행물(refs[0]) 추적 — candidate(topic/cafePostId)와 구분.
  // refs 확보 전에 skip된 엔트리에는 없다(optional). 기존 필드 제거·개명 없음(파서 호환).
  refCafePostId?: string
  refTitle?: string
  refCafeId?: string
  isShadowRef?: boolean
  // [Phase 1-a-②/2-a] ref 소스 단계 — production/core/publishable/shadow 구분 (additive optional)
  refSourceStage?: 'production' | 'core' | 'publishable' | 'shadow' | 'unknown'
  /**
   * [ref 계측 2026-07-29] 발행 원문이 **어느 fallback stage에서** 선택됐는지와 그 stage의 후보 source 분포.
   * 관측 전용 — 후보 선택·정렬·발행 결과에 일절 관여하지 않는다(additive optional, 파서 호환).
   * 목적: source 편중이 어느 단계에서 생기는지 실데이터로 확정. self-ref 경로는 'self'.
   */
  refStage?: RefStage
  /** 그 stage에서 filter 통과한 후보 수 */
  refPoolSize?: number
  /** 그 stage 후보의 cafeId 분포 (예: { remonterrace: 12, wgang: 5 }) */
  refCandidateSourceCounts?: Record<string, number>
  /** 선택된 mainRef의 cafeId — refCafeId와 동일 값이나 계측 파서 편의를 위해 별도 기록 */
  refSelectedSource?: string
  /** diversity 정렬 적용 여부 — PR-1은 계측만이므로 항상 false */
  refDiversityApplied?: boolean
  // [PR-2 Haiku dry-run 2026-07-14] main ref 품질 판정 기록 — 발행 직전 도달한 엔트리에만 (additive optional, 차단 없음)
  haiku?: Record<string, unknown>
  // [board routing 2026-07-12] 게시판 산출 근거 — 발행 성공 엔트리에만 기록 (additive optional, 파서 호환)
  routingDesire?: string
  routingGuard?: string
}

/** refs[0] 메타 — refs 확보 후의 topicResults 기록에 spread. ref 없으면 빈 객체(필드 미기록).
 * 파라미터를 unknown으로 받는 이유: refs 요소 타입이 getReferencePosts 제네릭 추론에 따라 좁아져
 * (u4Pool 경로 등) 호출부마다 달라짐 — 런타임 shape(id/title/cafeId)만 읽으므로 내부에서 안전 접근. */
function refMeta(ref?: unknown): Pick<TopicResult, 'refCafePostId' | 'refTitle' | 'refCafeId' | 'isShadowRef' | 'refSourceStage' | 'refSelectedSource'> {
  const r = ref as { id?: string; title?: string; cafeId?: string | null } | undefined
  if (!r?.id || typeof r.title !== 'string') return {}
  return {
    refCafePostId: r.id,
    refTitle: r.title.slice(0, 30),
    refCafeId: r.cafeId ?? undefined,
    isShadowRef: !!r.cafeId && SHADOW_CAFE_IDS.includes(r.cafeId),
    refSourceStage: r.cafeId ? sourceStageOfCafe(r.cafeId) : undefined,
    // [ref 계측 2026-07-29] refCafeId와 같은 값 — 계측 파서가 refStage/refCandidateSourceCounts와 한 묶음으로 읽도록 별도 키로도 남긴다
    refSelectedSource: r.cafeId ?? undefined,
  }
}

type PublishResult =
  | { success: true; postId: string; seoTransformed: boolean }
  | { success: false; skipReason: Extract<SkipReason, 'SEASON_MISMATCH' | 'DUPLICATE_TITLE' | 'PUBLISH_FAILED' | 'POLITICAL_BLOCK'>; matchedKeyword?: string }

const CANDIDATE_POOL_SIZE = 15

function getDominantSkipReason(results: TopicResult[]): SkipReason | null {
  const skipped = results.filter((r): r is TopicResult & { skipReason: SkipReason } => r.skipReason !== null)
  if (skipped.length === 0 || skipped.length !== results.length) return null

  const counts = new Map<SkipReason, number>()
  for (const result of skipped) {
    counts.set(result.skipReason, (counts.get(result.skipReason) ?? 0) + 1)
  }

  let dominant: { reason: SkipReason; count: number } | null = null
  for (const [reason, count] of counts.entries()) {
    if (!dominant || count > dominant.count) dominant = { reason, count }
  }

  return dominant?.count === results.length ? dominant.reason : null
}

function parseTopicResults(details: string | null): TopicResult[] {
  if (!details) return []
  try {
    const parsed = JSON.parse(details) as { topicResults?: unknown }
    return Array.isArray(parsed.topicResults) ? parsed.topicResults as TopicResult[] : []
  } catch {
    return []
  }
}

async function getRepeatedZeroPublishAlert(currentResults: TopicResult[]): Promise<{ count: number; reason: SkipReason } | null> {
  const reason = getDominantSkipReason(currentResults)
  if (!reason) return null

  const recentLogs = await prisma.botLog.findMany({
    where: { botType: 'CAFE_CRAWLER', action: 'CONTENT_CURATE' },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { status: true, itemCount: true, details: true },
  })

  let count = 1
  for (const log of recentLogs) {
    if (log.status !== 'FAILED' || log.itemCount !== 0) break
    const previousReason = getDominantSkipReason(parseTopicResults(log.details))
    if (previousReason !== reason) break
    count++
  }

  return count >= 3 ? { count, reason } : null
}

// P0-A: 후보 재시도 루프 차단.
// DUPLICATE_TITLE 스킵은 usedAt 마킹(발행 성공 시에만 수행)보다 먼저 return하므로,
// 중복 스킵된 killer/trend 후보가 매 run 최상위 후보로 재선발되며 같은 토픽을 반복 시도한다.
// 오늘 BotLog(기존 로그=state, DB write 없음)에서 임계 이상 낸 키를 읽어
// 그날 후보 구성에서 제외한다. "발행됨"으로 마킹하지 않음(usedAt 무변경).
// [2026-07-03] 2→1: 1회성 DUPLICATE_TITLE 후보도 그날 즉시 격리(재시도 루프 완화). BotLog state만 사용, DB write 0.
// [Phase 0-c] POLITICAL_BLOCK도 동일 격리 + refCafePostId(실제 발행물) 키 추가.
//   집계는 curator-quarantine.ts 순수 함수 — 과거 로그(ref 필드 없음)에도 안전.
const DUP_QUARANTINE_THRESHOLD = 1
async function getDailyQuarantine(since: Date): Promise<DailyQuarantine> {
  const logs = await prisma.botLog.findMany({
    where: { botType: 'CAFE_CRAWLER', action: 'CONTENT_CURATE', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { details: true },
  })
  return buildDailyQuarantine(logs.map((log: { details: string | null }) => parseTopicResults(log.details)), DUP_QUARANTINE_THRESHOLD)
}

/** HAIKU_QUALITY_BLOCKED 이력 cafePostId — 한 번 차단된 원문은 재선정하지 않는다 (90일 lookback, 실패 시 빈 Set으로 발행 지속) */
async function getHaikuBlockedRefIds(): Promise<Set<string>> {
  try {
    const logs = await prisma.botLog.findMany({
      where: { action: 'HAIKU_QUALITY_BLOCKED', createdAt: { gte: new Date(Date.now() - 90 * 24 * 3600_000) } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { logData: true },
    })
    return extractBlockedRefIds(logs.map(l => l.logData))
  } catch (err) {
    console.warn(`[ContentCurator] BLOCKED 격리 조회 실패(발행 지속): ${err instanceof Error ? err.message : err}`)
    return new Set()
  }
}


/** 참고용 원본 글 가져오기 — 3단계 fallback (B19+B24)
 * 1단계: 48h + 키워드 / 2단계: 7일 + 키워드 / 3단계: 7일 + desireCategory만
 * usable≥5 필터: wave-processor BLOCK2 기준(usableCount<5)과 통일, wave4 full run 보장
 */
// refs 조회 공통 select — getReferencePosts refs 와 killer self-ref fast lane 이 동일 shape 를 공유(타입 일치)
const REF_SELECT_FIELDS = { id: true, title: true, content: true, cafeName: true, topComments: true, desireCategory: true, commentCount: true, cafeId: true } as const

async function getReferencePosts(topic: string, desireCat: string, limit: number, quarantinedPostIds: ReadonlySet<string> = new Set()) {
  const base = {
    isUsable: true, usedAt: null, isPopular: false,
    imageUrls: { isEmpty: true }, videoUrls: { isEmpty: true },
    commentCrawled: true,  // topComments가 한 번이라도 수집된 글만 (usable 필터 사전 조건)
    cafeId: { in: PUBLISHABLE_CAFE_IDS },  // [Phase 1-a-②] 발행 refs = production + publishable (shadow는 계속 격리)
    NOT: { AND: [{ cafeId: 'dlxogns01' }, { boardName: { notIn: DLXOGNS01_ALLOWED_BOARDS } }] },
  }
  const topicWords = topic.split(/[\s·,]+/).filter(w => w.length >= 2)
  const firstWord = topicWords[0] ?? topic
  // commentCount 추가 — usable4 조건부 후보 판정용(cnt>=8). usable>=5 경로는 이 필드를 읽지 않아 동작 무변경.
  const selectFields = REF_SELECT_FIELDS
  // killerScore 상위권(~63위)이 usable<5인 경우가 많아 넉넉히 조회 후 usable 필터 적용.
  // 실측: killerScore top-63 전체가 usable<5, 64위부터 usable≥5 등장 → 최소 150개 필요.
  const candidateTake = Math.max(limit * 50, 150)

  // 기존 오염 CafePost 2차 방어 (isUsable=true이지만 접근 차단 안내문이 남아있는 경우)
  const ACCESS_BLOCKED_SIGNALS_CC = [
    '검색 비허용 게시물', '가입이 필요합니다', '카페의 멤버가 되어보세요',
    '카페에 가입하면 바로 글을 볼 수 있어요', '10초 만에 가입하기',
  ] as const
  const STRONG_PZP_SIGNALS_CC = [
    '.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video',
    '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다',
  ] as const
  const WEAK_PZP_SIGNALS_CC = [
    '재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초',
  ] as const
  // [REFS_EMPTY fix 2026-07-10] 당일 격리(DUP/POL) 글을 slice(limit) "이전"에 선제 제외.
  //   격리된 상위 killerScore 글이 refs top-3를 점유하면, 그 아래 비격리 유효 refs가 존재해도
  //   호출부 사후 필터에서 refs가 통째로 비어 REFS_EMPTY 전멸(2026-07-10 15:17~ 6연속 FAILED 실측)하던
  //   순서 결함 교정. 가드 완화 아님 — 같은 격리를 더 이른 단계에 적용. 호출부의 사후 filter는 이중 방어로 유지.
  const filterBlocked = <T extends { title: string; content: string }>(posts: T[]): T[] =>
    posts.filter(p => {
      // 당일 격리 글 선제 제외 (위 REFS_EMPTY fix) — slice(limit) 이전, 4개 stage 공통 적용
      if (quarantinedPostIds.size > 0 && quarantinedPostIds.has((p as unknown as { id: string }).id)) return false
      // 계절 불일치 reference 선제 제외 — poison reference(예: 6월에 '크리스마스' 본문)가
      // 생성 본문을 오염시켜 publishCuratedContent의 SEASON_MISMATCH로 반복 차단되는 것 방지.
      // refs 후보에서 빠지므로 usedAt 미마킹으로 인한 sticky poison(같은 글이 반복 첫 후보)도 해소.
      if (isSeasonMismatch(p.title, p.content)) {
        console.log(`[ContentCurator] 계절 불일치 reference 제외: "${p.title.slice(0, 20)}"`)
        return false
      }
      // 정치 키워드 hard block — 정치색 reference는 후보에서 선제 제외 (P0)
      if (hasPoliticalKeyword(p.title, p.content)) {
        console.log(`[ContentCurator] 정치 키워드 reference 제외: "${p.title.slice(0, 20)}"`)
        return false
      }
      // [age-fit 1차 기계필터 2026-07-11] 발화자 타깃 부적합(젊은 연령 자기소개·저연령 육아·입시 학부모·미혼 연애)
      //   reference 선제 제외 — crawler 필터가 못 막는 기존 재고·production 글의 발행 방어선.
      const ageFitRef = findAgeFitViolation(p.title, p.content)
      if (ageFitRef) {
        console.log(`[ContentCurator] age-fit reference 제외(${ageFitRef}): "${p.title.slice(0, 20)}"`)
        return false
      }
      // [empty-content 2026-07-29] 정화하면 제목/본문이 0자가 되는 원문 선제 제외.
      //   생성 단계에서만 걸러도 되지만, 그러면 같은 글이 매 회차 mainRef로 다시 뽑혀
      //   회차 전체가 실패로 전멸한다(실측: 1건이 93회 반복 → 12회 연속 0발행).
      if (!hasPublishableBody(p.title, p.content)) {
        console.log(`[ContentCurator] 정화 후 본문 없음 reference 제외: "${p.title.slice(0, 20)}"`)
        return false
      }
      const flat = p.content.replace(/\n/g, ' ') // R1: 본문 줄바꿈 보존 후에도 시그널 매칭 유지
      const blocked = ACCESS_BLOCKED_SIGNALS_CC.some(s => flat.includes(s))
      if (blocked) { console.log(`[ContentCurator] 접근 차단 안내문 2차 필터 skip: "${p.title.slice(0, 30)}"`)
        return false }
      const hasStrongPzp = STRONG_PZP_SIGNALS_CC.some(s => flat.includes(s))
      const weakPzpCount = WEAK_PZP_SIGNALS_CC.filter(s => flat.includes(s)).length
      const videoPzp = hasStrongPzp || weakPzpCount >= 2
      if (videoPzp) console.log(`[ContentCurator] PZP/동영상 2차 필터 skip: "${p.title.slice(0, 30)}"`)
      return !videoPzp
    })

  // usable 메타데이터 누적 (LOW_USABLE_COMMENTS topicResults 기록용)
  let totalCandidatesChecked = 0
  let maxUsableCount = 0
  const u4Pool: Array<{ id: string; title: string; content: string; cafeName: string; topComments: unknown; desireCategory: string | null; commentCount: number }> = []
  /** [ref 계측] stage·후보 수·source 분포 — 관측 전용, 반환 refs에 영향 없음 */
  //   pool 원소 타입은 withUsableFilter 제네릭을 거치며 { topComments: unknown }으로 좁혀지므로
  //   unknown[]로 받고 cafeId만 좁혀 읽는다(any 미사용).
  const metricsOf = (stage: RefStage, pool: readonly unknown[]): RefMetrics => {
    const m: Record<string, number> = {}
    for (const q of pool) {
      const c = (q as { cafeId?: string | null }).cafeId ?? 'unknown'
      m[c] = (m[c] ?? 0) + 1
    }
    return { refStage: stage, refPoolSize: pool.length, refCandidateSourceCounts: m }
  }

  const withUsableFilter = <T extends { topComments: unknown }>(posts: T[]): T[] => {
    totalCandidatesChecked += posts.length
    for (const p of posts) {
      const u = computeUsableCount(p.topComments)
      if (u > maxUsableCount) maxUsableCount = u
      // usable==4 후보를 별도 수집(원본 그대로) — 조건 판정/발행은 호출부에서. usable>=5 필터에는 영향 없음.
      if (u === 4) u4Pool.push(p as unknown as (typeof u4Pool)[number])
    }
    return posts.filter(p => computeUsableCount(p.topComments) >= 5)
  }

  // 1단계: 48h + 키워드
  const cutoff48h = new Date(Date.now() - 48 * 3600_000)
  const s1 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff48h }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s1.length >= limit) return { refs: s1.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount, u4Pool, ...metricsOf('s1', s1) }

  // 2단계: 7일 + 키워드
  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600_000)
  const s2 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s2.length >= limit) return { refs: s2.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount, u4Pool, ...metricsOf('s2', s2) }

  // 3단계: 7일 + desireCategory만 (키워드 없이)
  const s3 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, ...(desireCat !== 'GENERAL' ? { desireCategory: desireCat } : {}) },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s3.length >= limit) return { refs: s3.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount, u4Pool, ...metricsOf('s3', s3) }

  // [Phase 1-a-② 2026-07-09] shadow fallback(fillWithShadow, PR #90 응급) 제거.
  //   remon/goondae는 publishable로 승격되어 base 쿼리(PUBLISHABLE_CAFE_IDS)의 stage 1~4에 정식 편입 —
  //   "몰래 보충 + usedAt 미마킹 + cafePostId null" 경로 소멸. 진짜 shadow(현재 없음)는 base에서 계속 격리.

  // 4단계: desireCategory 무관 전체 pool — DB 카테고리 분류 97% NULL 상태 보완
  // GENERAL은 stage 3와 동일 쿼리라 스킵
  if (desireCat !== 'GENERAL') {
    const s3ids = new Set(s3.map(p => p.id))
    const s4 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
      where: { ...base, postedAt: { gte: cutoff7d } },
      orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
      take: candidateTake, select: selectFields,
    }))).filter(p => !s3ids.has(p.id))
    if (s4.length > 0) console.log(`[ContentCurator] stage4 fallback (${desireCat}→NULL pool): ${s4.length}개 발견`)
    const s34 = [...s3, ...s4]
    return { refs: s34.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount, u4Pool, ...metricsOf('s4', s34) }
  }
  return { refs: s3.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount, u4Pool, ...metricsOf('s3', s3) }
}

/**
 * 글의 발행 게시판 결정 — [2026-07-12] candidate desire(버킷) 상속 방식 폐기, 발행 원문(ref) 기준으로 전환.
 * (구 "A 단방향 LIFE2 가드 2026-06-10"의 버킷 상속 로직은 curator-shared.resolveBoardFromRef 로 대체됨)
 * B(페르소나 board 매칭)와 generateCuratedPost가 동일 결과를 쓰도록 단일 헬퍼로 유지.
 */
// C4(2026-06-16): 우울·자살관념·암·사망·중병 등 '심각/민감' 글은 유머·취미 게시판에 배정 금지.
//   원문 카페 인기글을 그대로 가져오다 보니 무거운 글이 HUMOR/엔터·TV·취미로 오배치됨
//   (예: 갱년기 우울 "사라지고 싶다"→유머, 엄마 암 종양→취미). STORY 고민/건강으로 강제 보정.
const SENSITIVE_DEPRESSION = ['사라지고 싶', '죽고 싶', '죽고싶', '살기 싫', '살기싫', '극단적 선택', '우울증', '의욕이 사라', '삶을 포기', '자해']
const SENSITIVE_MEDICAL = ['암센터', '종양', '암 진단', '암진단', '시한부', '말기암', '임종', '장례', '호스피스', '중환자실', '뇌출혈', '투병', '복수가 차']
function applySensitiveBoardOverride(
  text: string,
  board: { boardType: CommunityPublishBoardType; category: string },
): { boardType: CommunityPublishBoardType; category: string } {
  if (board.boardType === 'MENOPAUSE') return board
  const med = SENSITIVE_MEDICAL.some(k => text.includes(k))
  const dep = SENSITIVE_DEPRESSION.some(k => text.includes(k))
  if (!med && !dep) return board
  // 유머/엔터·TV/취미 배정만 보정(STORY 고민/건강으로). 이미 적절한 곳이면 그대로.
  if (board.boardType === 'HUMOR' || board.category === '취미') {
    return { boardType: 'STORY', category: med ? '건강' : '고민' }
  }
  return board
}

// [board routing 2026-07-12] candidate desire(bucket) 상속 제거 — 게시판은 발행 원문(ref)의
//   own desire + 원문 텍스트 신호만으로 결정한다(curator-shared.resolveBoardFromRef).
//   gold label 17건 실측: bucket 상속이 HUMOR 오분류 ~80%(candidate ENTERTAIN 상속)의 주범.
//   sensitive override(우울/의료 → STORY)는 기존대로 최종 적용.
function resolveBoardForPost(ownDesire: string | null | undefined, title: string, content: string): { boardType: CommunityPublishBoardType; category: string; routingDesire: string; routingGuard: string } {
  const routed = resolveBoardFromRef(ownDesire, title, content)
  const overridden = applySensitiveBoardOverride(`${title} ${content}`, routed)
  if (overridden.boardType !== routed.boardType || overridden.category !== routed.category) {
    return { ...overridden, routingDesire: routed.routingDesire, routingGuard: `${routed.routingGuard}+SENSITIVE` }
  }
  return routed
}

/**
 * killer self-ref fast lane — killer candidate 의 production 원문이 발행 자격을 모두 충족하면
 * 그 원문 자체를 refs[0] 로 반환한다(다른 refs 재검색 없이 발행). 자격 미달·shadow·미존재 시 null → 기존 getReferencePosts fallback.
 * getReferencePosts base 와 동일한 게이트(isUsable/usedAt/commentCrawled/img·vid빈/usable>=5/season/access·PZP 2차방어)를 적용해 품질 불변.
 * killer 후보는 CURATION_CORE(production+core) — remon/goondae는 Phase 2-a로 core 승격되어 self-ref 대상.
 * publishable(온보딩 단계)은 refs/보충 lane으로만, shadow는 계속 배제. DB write 없음(findUnique read only).
 */
async function loadEligibleKillerSelfRef(
  cafePostId: string,
  _desireCat: string,
): Promise<{ id: string; title: string; content: string; cafeName: string; topComments: unknown; desireCategory: string | null; commentCount: number; cafeId: string | null } | null> {
  const p = await prisma.cafePost.findUnique({
    where: { id: cafePostId },
    select: { ...REF_SELECT_FIELDS, isUsable: true, usedAt: true, commentCrawled: true, imageUrls: true, videoUrls: true, boardName: true },
  })
  if (!p) return null
  // production 한정 (shadow 절대 제외) — killerPosts 가 이미 PRODUCTION 필터지만 방어적 재확인
  // [Phase 1-b] self-ref 자격: production + publishable (shadow는 계속 배제) — publishable 후보의 자기 원문 발행 허용
  if (!p.cafeId || SHADOW_CAFE_IDS.includes(p.cafeId) || !PUBLISHABLE_CAFE_IDS.includes(p.cafeId)) return null
  // dlxogns01 허용 board 만 (getReferencePosts base 와 동일)
  if (p.cafeId === 'dlxogns01' && !DLXOGNS01_ALLOWED_BOARDS.includes(p.boardName ?? '')) return null
  // 발행 자격 게이트 (getReferencePosts base 와 동일 + usable>=5)
  if (!p.isUsable || p.usedAt !== null || !p.commentCrawled) return null
  if ((p.imageUrls ?? []).length > 0 || (p.videoUrls ?? []).length > 0) return null
  if (computeUsableCount(p.topComments) < 5) return null
  if (isSeasonMismatch(p.title, p.content)) return null
  // [age-fit 1차 기계필터 2026-07-11] self-ref는 getReferencePosts filterBlocked를 거치지 않으므로 동일 게이트 적용
  if (findAgeFitViolation(p.title, p.content)) return null
  // [empty-content 2026-07-29] filterBlocked와 동일 — 정화 후 제목/본문이 비는 원문 제외
  if (!hasPublishableBody(p.title, p.content)) return null
  // access blocked / PZP 2차 방어 (getReferencePosts filterBlocked 와 동일 기준 — isUsable=true 라도 오염 잔존분 차단)
  const flat = p.content.replace(/\n/g, ' ')
  const ACCESS_BLOCKED = ['검색 비허용 게시물', '가입이 필요합니다', '카페의 멤버가 되어보세요', '카페에 가입하면 바로 글을 볼 수 있어요', '10초 만에 가입하기']
  const STRONG_PZP = ['.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video', '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다']
  const WEAK_PZP = ['재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초']
  if (ACCESS_BLOCKED.some(s => flat.includes(s))) return null
  if (STRONG_PZP.some(s => flat.includes(s)) || WEAK_PZP.filter(s => flat.includes(s)).length >= 2) return null
  // refs[0] shape 로 반환 (REF_SELECT_FIELDS 필드만 — 게이트 전용 필드 제외)
  return {
    id: p.id, title: p.title, content: p.content, cafeName: p.cafeName,
    topComments: p.topComments, desireCategory: p.desireCategory,
    commentCount: p.commentCount, cafeId: p.cafeId,
  }
}

/**
 * 생성 실패 사유를 호출부에 그대로 전달한다 — BotLog skipReason 세분화용.
 * 실패 지점에서 바로 사유를 붙이므로 호출부가 원인을 다시 계산할 필요가 없다.
 */
type CuratedResult =
  | { ok: true; curated: CuratedContent }
  | { ok: false; reason: Extract<SkipReason, 'NO_MAIN_REF' | 'EMPTY_TITLE_AFTER_CLEAN' | 'EMPTY_CONTENT_AFTER_CLEAN'> }

/** 큐레이션된 글 생성 — 원본 카페글 제목·본문 그대로 사용 (AI 각색 없음) */
async function generateCuratedPost(
  persona: PersonaMatch,
  topic: string,
  referencePosts: { id: string; title: string; content: string; cafeName: string; desireCategory?: string | null; cafeId?: string }[],
  _desireCat?: string,  // [board routing 2026-07-12] 라우팅이 ref 원문 기준으로 바뀌며 미사용 — 호출부 시그니처 호환용 유지
): Promise<CuratedResult> {
  const mainRef = referencePosts[0]
  if (!mainRef) return { ok: false, reason: 'NO_MAIN_REF' }

  const boardInfo = resolveBoardForPost(mainRef.desireCategory, mainRef.title, mainRef.content)

  // 후보 필터(filterBlocked/self-ref)와 **같은 헬퍼**를 쓴다 — 두 곳의 판정이 갈리면
  // 후보는 통과했는데 생성만 실패하는 상태가 다시 생긴다.
  const title = cleanCuratedTitle(mainRef.title)
  if (!title) return { ok: false, reason: 'EMPTY_TITLE_AFTER_CLEAN' }

  // 원문(CafePost)은 미수정. 안내문만 있던 글은 content=''가 될 수 있어 empty guard로 스킵(빈 본문 발행 방지).
  const content = cleanCuratedContent(mainRef.content)
  if (!content) return { ok: false, reason: 'EMPTY_CONTENT_AFTER_CLEAN' }

  return {
    ok: true,
    curated: {
    personaId: persona.id,
    title,
    content,
    boardType: boardInfo.boardType,
    category: boardInfo.category,
    sourceTopic: topic,
    // [Phase 1-a-②] publishable ref도 production과 동일 — 항상 usedAt 마킹 + Post.cafePostId 연결.
    // (구 shadow 분기(sourcePostIds=[])는 cafePostId=null 발행·반복 재발행의 원천이라 제거)
    sourcePostIds: [mainRef.id],
    },
  }
}

const SEASONAL_KEYWORDS: Record<string, number[]> = {
  '벚꽃': [3, 4], '꽃구경': [3, 4, 5], '벚꽃놀이': [3, 4],
  '장마': [6, 7], '여름휴가': [6, 7, 8], '피서': [7, 8], '물놀이': [7, 8],
  '단풍': [10, 11], '단풍놀이': [10, 11],
  '크리스마스': [12], '눈썰매': [12, 1, 2], '설날': [1, 2],
}

function isSeasonMismatch(title: string, content: string): boolean {
  const text = title + ' ' + content
  const currentMonth = new Date().getMonth() + 1
  for (const [keyword, allowedMonths] of Object.entries(SEASONAL_KEYWORDS)) {
    if (text.includes(keyword) && !allowedMonths.includes(currentMonth)) return true
  }
  return false
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

/** 큐레이션 글을 DB에 게시 */
async function publishCuratedContent(curated: CuratedContent): Promise<PublishResult> {
  const userId = await getCuratorBotUser(curated.personaId)

  const htmlContent = toCuratedHtmlContent(curated.content)
  const summary = toCuratedSummary(curated.content)

  // SEO 메타 생성(추출적 · AI 미사용) — 화면 title/summary/slug·본문(htmlContent)은 그대로 두고
  // 검색용 seoTitle/seoDescription만 추가한다. 실패·정책위반 시 seoTitle/seoDescription=null(fallback).
  // popular-curator와 동일한 buildPopularSeoMeta 재사용(원문 title/content의 단어만 사용).
  const seo = buildPopularSeoMeta({ title: curated.title, rawContent: curated.content, summary })

  // 정치 키워드 hard block — publish 직전 최종 검사 (P0). 정치색 글은 절대 발행 안 함.
  const political = findPoliticalKeyword(curated.title, curated.content)
  if (political) {
    console.log(`[ContentCurator] 정치 키워드 발행 차단: "${curated.title.slice(0, 20)}" (kw=${political.keyword}/${political.field})`)
    return { success: false, skipReason: 'POLITICAL_BLOCK', matchedKeyword: political.keyword }
  }

  // 계절 불일치 필터 (P3)
  if (isSeasonMismatch(curated.title, curated.content)) {
    console.log(`[ContentCurator] 계절 불일치 스킵: "${curated.title.slice(0, 20)}"`)
    return { success: false, skipReason: 'SEASON_MISMATCH' }
  }

  // 크로스소스 중복 방지 (LIFE2·STORY·HUMOR — Seed·PopularCurator와 동일 주제 중복 차단)
  if (['LIFE2', 'STORY', 'HUMOR', 'MENOPAUSE'].includes(curated.boardType)) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentPosts = await prisma.post.findMany({
      where: { boardType: curated.boardType as 'LIFE2' | 'STORY' | 'HUMOR' | 'MENOPAUSE', createdAt: { gte: since24h } },
      select: { title: true },
    })
    if (recentPosts.length > 0) {
      const toNouns = (t: string) => t.match(/[가-힣]{2,}/g) ?? []
      const newNouns = new Set(toNouns(curated.title))
      const isDuplicate = recentPosts.some(
        p => toNouns(p.title).filter(n => newNouns.has(n)).length >= 2
      )
      // editDistance 오탐 방지 — 짧은 제목끼리는 우연히 편집거리가 작아 전혀 다른 글이 중복 처리됨
      // (예: "축구화?"↔"학폭ㅡㅡ" edit=4, 명사 교집합 0). 완전 동일(edit=0)은 길이 무관 차단하고,
      // 근사 중복(edit 1~5)은 두 제목 모두 normalized length >= 8 일 때만 적용. 명사 교집합(isDuplicate)은 무변경.
      const norm = (t: string) => t.replace(/\s+/g, '').trim()
      const curTitleLongEnough = norm(curated.title).length >= 8
      const isTitleNearDuplicate = recentPosts.some(p => {
        const ed = editDistance(p.title, curated.title)
        if (ed === 0) return true
        return curTitleLongEnough && norm(p.title).length >= 8 && ed <= 5
      })
      if (isDuplicate || isTitleNearDuplicate) {
        console.log(`[ContentCurator] ${curated.boardType} 중복 스킵: "${curated.title.slice(0, 20)}"`)
        return { success: false, skipReason: 'DUPLICATE_TITLE' }
      }
    }
  }

  // slug 생성 (transaction 전 — JOB 게시판 제외)
  const slug = curated.boardType !== 'JOB'
    ? await generateCommunitySlug(curated.title)
    : undefined

  // post 생성 + cafePost usedAt 마킹을 트랜잭션으로 묶어 원자성 보장
  try {
    const postId = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: curated.title,
          content: htmlContent,
          summary,
          seoTitle: seo.seoTitle,
          seoDescription: seo.seoDescription,
          boardType: curated.boardType as 'STORY' | 'HUMOR' | 'LIFE2' | 'MENOPAUSE' | 'JOB',
          category: curated.category ?? '자유수다',
          authorId: userId,
          source: 'BOT',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          cafePostId: curated.sourcePostIds[0] ?? null,
          ...(slug ? { slug } : {}),
        },
      })
      if (curated.sourcePostIds.length > 0) {
        await tx.cafePost.updateMany({
          where: { id: { in: curated.sourcePostIds } },
          data: { usedAt: new Date() },
        })
        // killerScore ≥ 75인 소스글 기반 발행 → isFeatured=true 자동 적용
        const killerSource = await tx.cafePost.findFirst({
          where: { id: { in: curated.sourcePostIds }, killerScore: { gte: 75 } },
          select: { id: true },
        })
        if (killerSource) {
          await tx.post.update({
            where: { id: post.id },
            data: { isFeatured: true, featuredAt: new Date() },
          })
        }
      }
      return post.id
    })
    return { success: true, postId, seoTransformed: seo.transformed }
  } catch (err) {
    console.error('[ContentCurator] publishCuratedContent 트랜잭션 실패:', err)
    return { success: false, skipReason: 'PUBLISH_FAILED' }
  }
}

/** 댓글 파동 큐 등록 (wave1: +1분, wave2: +5분, wave3: +30분, wave4: +60분) */
async function enqueueCommentWave(postId: string, cafePostId: string, authorPersonaId: string) {
  const now = new Date()
  await prisma.commentWaveQueue.create({
    data: {
      postId,
      cafePostId,
      authorPersonaId,
      wave1At: new Date(now.getTime() + 60_000),
      wave2At: new Date(now.getTime() + 300_000),
      wave3At: new Date(now.getTime() + 1_800_000),
      wave4At: new Date(now.getTime() + 3_600_000),
      expiresAt: new Date(now.getTime() + 216_000_000), // 60시간
    },
  })
}

/** 메인 실행 */
export async function main() {
  console.log('[ContentCurator] 시작 — source-backed 콘텐츠 큐레이션')
  const startTime = Date.now()

  // [trend 제거 1차 2026-07-10] loadTodayBrief/hotTopics 의존 제거.
  //   기존: hotTopics 없으면 early return(발행 전체 중단) + trendCandidates lane(7일 발행률 5.2%, 격리 빈발).
  //   현행: source-backed 후보(killer=production+core, publishable 온보딩 lane)만으로 발행 —
  //   CafeTrend/DailyBrief가 전무해도 회차가 정상 진행된다. trend-analyzer/daily-brief 자체는 계속 실행됨(소비만 중단).
  //   감사: docs/analysis/content-curate-trend-psych-removal-audit-2026-07-10.md
  const maxPosts = 3
  let publishedCount = 0
  let seoTransformedCount = 0
  let seoFallbackCount = 0
  // usable4 조건부 허용 — env flag OFF(기본)면 완전 비활성(usable>=5 현행과 동일). 회차당 최대 1건.
  const ENABLE_CONDITIONAL_USABLE4 = process.env.ENABLE_CONDITIONAL_USABLE4 === 'true'
  let conditionalU4Used = 0
  let conditionalU4CandidateCount = 0
  let conditionalU4PublishedCount = 0
  let conditionalU4SkippedCount = 0
  let medicalAdviceSkippedCount = 0
  const SENSITIVE_RE = /자살|죽고싶|이혼하|불륜|바람났|폭력|학대|성폭|사이비|파산했|빚더미/
  // usable==4 후보 중 안전한 글 1개 선별 — 본문>=150 · cnt>=8 · 민감/의료조언 제외.
  // 정치는 getReferencePosts.filterBlocked(hasPoliticalKeyword)에서 이미 제외됨. duplicate/keyword는 이후 발행 흐름이 처리.
  const pickConditionalUsable4 = <T extends { title: string; content: string; commentCount: number }>(pool: T[]): T | null => {
    for (const p of pool) {
      const t = replaceCafeReferences(stripMarkdown((p.title ?? '').trim()))
      const b = replaceCafeReferences(stripMarkdown((p.content ?? '').trim()))
      if (b.length < 150 || (p.commentCount ?? 0) < 8) { conditionalU4SkippedCount++; continue }
      if (SENSITIVE_RE.test(`${t} ${b}`)) { conditionalU4SkippedCount++; continue }
      if (findMedicalAdviceRequest(t, b)) { medicalAdviceSkippedCount++; conditionalU4SkippedCount++; continue }
      conditionalU4CandidateCount++
      return p
    }
    return null
  }

  // 오늘 이미 발행된 욕망 집계 — 시간당 동일 욕망 반복 방지 (B20)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayUsedPosts = await prisma.cafePost.findMany({
    where: { usedAt: { gte: todayStart } },
    select: { desireCategory: true },
  })
  const desireUsedCount: Record<string, number> = {}
  for (const { desireCategory } of todayUsedPosts) {
    const key = desireCategory ?? 'GENERAL'
    desireUsedCount[key] = (desireUsedCount[key] ?? 0) + 1
  }

  // 오늘 발행된 BOT 글 제목 목록 — 키워드 편중 방지 (P1)
  const todayPublishedTitles = await prisma.post.findMany({
    where: { source: 'BOT', createdAt: { gte: todayStart } },
    select: { title: true },
  })

  // P0-A + Phase 0-c: 오늘 DUPLICATE_TITLE·POLITICAL_BLOCK을 낸 후보/refs 격리 (재시도 루프 차단)
  const quarantine = await getDailyQuarantine(todayStart)
  // 후보(cafePostId)든 실제 발행물(refCafePostId)이든 오늘 차단된 글은 재시도하지 않는다 — 어차피 publish 게이트에서 다시 차단될 시도만 제거(가드 무변경)
  const quarantinedTopics = new Set([...quarantine.dup.topics, ...quarantine.political.topics])
  // [2026-07-18 hotfix] Haiku 차단 이력 원문 영구 격리 — 재선정→캐시 만료 재판정 요동→발행 우회 루프 차단
  const haikuBlockedIds = await getHaikuBlockedRefIds()
  const quarantinedPostIds = new Set([
    ...quarantine.dup.cafeIds, ...quarantine.dup.refIds,
    ...quarantine.political.cafeIds, ...quarantine.political.refIds,
    ...haikuBlockedIds,
  ])
  if (quarantinedTopics.size || quarantinedPostIds.size) {
    console.log(`[ContentCurator] 격리: topic ${quarantinedTopics.size}개 / cafePost ${quarantinedPostIds.size}개 (HAIKU_BLOCKED ${haikuBlockedIds.size}개 포함) (DUP ${quarantine.dup.cafeIds.size}+refs ${quarantine.dup.refIds.size} / POL ${quarantine.political.cafeIds.size}+refs ${quarantine.political.refIds.size}, ≥${DUP_QUARANTINE_THRESHOLD}회)`)
  }
  // keyword overlap 오탐 방지 — 어미·조사·기능어는 주제어가 아니므로 제외
  const OVERLAP_STOPWORDS = new Set([
    '해요', '이요', '에요', '어요', '아요', '해서', '하고', '해도',
    '가요', '이야', '거야', '줘요', '봐요', '되요', '는데', '인데',
    '같아', '같이', '있어', '없어', '싶어', '했어', '봤어', '갔어',
    '에서', '으로', '에게', '이나', '거나', '에도', '이도', '이고',
    '이게', '그게', '저게', '이건', '그건', '저건',
    '많이', '너무', '정말', '진짜', '아직', '이미', '그냥', '항상',
    '오늘', '내일', '어제', '이번', '지난', '다음',
    '데이',
  ])
  function countKeywordOverlap(title: string): number {
    const nouns = (title.match(/[가-힣]{2,}/g) ?? [])
      .filter(n => !OVERLAP_STOPWORDS.has(n))
    const publishedAll = todayPublishedTitles.map(p => p.title).join(' ')
    let max = 0
    for (const n of nouns) {
      const cnt = publishedAll.match(new RegExp(n, 'g'))?.length ?? 0
      if (cnt > max) max = cnt
    }
    return max
  }

  // 욕망별 하루 최대 발행 수 (75건/일 기준 30%/15%/8%)
  const MAX_PER_DESIRE: Partial<Record<string, number>> = { HEALTH: 22, FAMILY: 11, MONEY: 3 }
  const DEFAULT_MAX_DESIRE = 6

  function isDesireExhausted(desire: string): boolean {
    return (desireUsedCount[desire] ?? 0) >= (MAX_PER_DESIRE[desire] ?? DEFAULT_MAX_DESIRE)
  }

  // [trend 제거 1차] desireMap(topDesires) 재정규화 제거 — trendCandidates 정렬 전용이었음.
  //   욕망 분산은 MAX_PER_DESIRE + desireUsedCount(usedAt 실적 기반, psych desireCategory ?? guessDesire)로 유지.

  // ─── killerPosts 날짜 제한 7일 (Fix 1) ───────────────────────
  // 날짜 제한으로 34일된 "청국장" 등 오래된 글의 영구 재선발 차단
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // [source diversity] 플래그 on일 때만 7일 점유율 1회 조회 — off면 추가 쿼리 0, 기존 동작과 완전 동일
  const usedShare7d = SOURCE_DIVERSITY_SORT ? await fetchUsedShare7d() : null
  // [pool 구조 2026-07-29] 격리 제외를 take **이전** where 조건으로 이동.
  //   기존에는 take:30으로 상위 30건을 뽑은 뒤 사후 filter로 격리를 걸렀는데,
  //   격리(HAIKU 90일 누적)가 상위 killerScore에 몰려 30건 중 18건(60%)을 잠식했다.
  //   그 결과 유효 후보가 12건으로 줄어 candidatePoolSize가 4~13에 머물렀다.
  //   임계·정렬·격리 정책은 그대로 두고 **적용 순서만** 바꾼다(완화 아님).
  const excludedPostIds = [...quarantinedPostIds]
  const killerPostsRaw = await prisma.cafePost.findMany({
    where: {
      killerScore: { gte: 50 }, isUsable: true, usedAt: null, isPopular: false, imageUrls: { isEmpty: true },
      crawledAt: { gte: sevenDaysAgo },  // crawledAt은 항상 설정됨(NOT NULL) — postedAt null 허용
      cafeId: { in: CURATION_CORE_CAFE_IDS },  // [Phase 2-a] killer 후보 = production + core (killerScore 순 동등 경쟁, publishable/shadow는 계속 격리)
      NOT: { AND: [{ cafeId: 'dlxogns01' }, { boardName: { notIn: DLXOGNS01_ALLOWED_BOARDS } }] },
      ...(excludedPostIds.length > 0 ? { id: { notIn: excludedPostIds } } : {}),
    },
    orderBy: { killerScore: 'desc' },
    take: 60,  // 격리를 where에서 이미 제외하므로 조회분이 그대로 유효 후보가 된다(구 30 + 사후 격리 → 실효 12)
    select: { id: true, title: true, postedAt: true, killerScore: true, desireCategory: true, cafeId: true },
  })
  // [source diversity] 같은 10점 밴드 안에서만 저점유 source 우선(밴드 간 품질 순위·floor 불변)
  const killerPosts = usedShare7d ? applyDiversitySort(killerPostsRaw, usedShare7d) : killerPostsRaw
  if (usedShare7d) {
    const shareLog = [...usedShare7d.entries()].map(([c, s]) => `${c}:${Math.round(s * 100)}%`).join(' ')
    console.log(`[ContentCurator] source diversity ON — 7일 점유 ${shareLog}`)
  }

  // ─── candidatePool 구성 (Fix 2-B) ─────────────────────────────
  // [2단계 보충 2026-07-09] killer 후보를 slice 없이 전량 보유(최대 take 30). base 4개 유지 + trend가 못 채운
  //   빈자리를 killer 5번째~로 보충 → pool 을 CANDIDATE_POOL_SIZE(15) 근접 유지. 상위 후보가 정치/중복/저품질로
  //   skip 돼도 다음 killer 후보를 계속 시도해 published=0 회차를 줄인다. 가드는 그대로(완화 아님, 후보 보충).
  //   설계: docs/analysis/content-curation-candidate-redesign-2026-07-09.md
  //   [pool 구조 2026-07-29] 격리 제외의 **주 경로는 위 where의 id notIn**이다.
  //   여기 quarantinedPostIds.has 는 동일 Set을 쓰는 방어용 safety net(실측 제거 0건).
  //   isDesireExhausted 는 desire별 발행 실적 기반 동적 판정이라 where로 옮길 수 없어 이 자리에 남는다.
  const killerCandidatesAll: CandidateTopic[] = killerPosts
    .filter(p => !isDesireExhausted(p.desireCategory ?? 'GENERAL') && !quarantinedPostIds.has(p.id))
    .map(p => ({
      topic: p.title,
      source: 'killer' as const,
      cafePostId: p.id,
      postedAt: p.postedAt ?? undefined,
      killerScore: p.killerScore ?? undefined,
      desireCategory: p.desireCategory ?? undefined,
    }))
  const killerCandidates: CandidateTopic[] = killerCandidatesAll.slice(0, 4)  // base 4 유지(격리/소진 후보는 filter로 이미 제외)
  if (killerCandidates.length > 0) {
    console.log(`[ContentCurator] 킬러글 후보: ${killerCandidates.length}건 (raw ${killerCandidatesAll.length})`)
  }

  // [trend 제거 1차 2026-07-10] trendCandidates lane(topic-only) 삭제 —
  //   topic이 검색 키일 뿐 발행물과 동일성이 없어 REFS_EMPTY/LOW_USABLE/DUPLICATE를 양산했고(7일 시도 1,623 → 발행 84),
  //   01:15 새벽 정렬도 trend 전용이라 함께 제거. CandidateTopic.source의 'trend' 유니온은 과거 BotLog 파서 호환용으로 유지.

  // [2단계 보충] killer 5번째~로 pool 을 15 근접 유지.
  //   killerCandidatesAll 은 이미 filter(격리/소진 제외) 통과분이라 추가 가드 불필요. self-ref/발행 시점 가드는 그대로.
  const supplementalCount = Math.max(0, CANDIDATE_POOL_SIZE - killerCandidates.length)
  const supplementalKiller = killerCandidatesAll.slice(4, 4 + supplementalCount)

  // [Phase 1-b] publishable source-backed 보충 lane — production killer/trend가 채우지 못한 빈자리만.
  //   remon/goondae 좋은 원문이 refs 재료로만 있고 후보로 못 올라와 pool=0이 되는 구조 병목 해소
  //   (실측 2026-07-09: production killer 30→격리 후 0, trend 0, publishable 발행가능 재고 31건 방치).
  //   PRODUCTION lane(trend/killer)과 완전 분리 — 임계(killerScore>=50)·가드 동일, 완화 없음.
  const publishableSlots = Math.max(0, CANDIDATE_POOL_SIZE - killerCandidates.length - supplementalKiller.length)
  let publishableCandidates: CandidateTopic[] = []
  if (publishableSlots > 0 && PUBLISHABLE_ONLY_CAFE_IDS.length > 0) {
    const publishablePostsRaw = await prisma.cafePost.findMany({
      where: {
        killerScore: { gte: 50 }, isUsable: true, usedAt: null, isPopular: false,
        imageUrls: { isEmpty: true }, videoUrls: { isEmpty: true }, commentCrawled: true,
        postedAt: { gte: sevenDaysAgo },
        cafeId: { in: PUBLISHABLE_ONLY_CAFE_IDS },
      },
      orderBy: { killerScore: 'desc' },
      take: 30,
      select: { id: true, title: true, postedAt: true, killerScore: true, desireCategory: true, cafeId: true },
    })
    // [source diversity] killer lane과 동일한 밴드 내 재정렬 (off면 원본 그대로)
    const publishablePosts = usedShare7d ? applyDiversitySort(publishablePostsRaw, usedShare7d) : publishablePostsRaw
    type PublishablePostRow = { id: string; title: string; postedAt: Date | null; killerScore: number | null; desireCategory: string | null; cafeId: string }
    publishableCandidates = (publishablePosts as PublishablePostRow[])
      .filter((p: PublishablePostRow) => !isDesireExhausted(p.desireCategory ?? 'GENERAL') && !quarantinedPostIds.has(p.id) && !quarantinedTopics.has(p.title))
      .slice(0, publishableSlots)
      .map((p: PublishablePostRow) => ({
        topic: p.title,
        source: 'publishable' as const,
        cafePostId: p.id,
        postedAt: p.postedAt ?? undefined,
        killerScore: p.killerScore ?? undefined,
        desireCategory: p.desireCategory ?? undefined,
      }))
  }

  // source-backed only: killerCandidates(base) 앞, supplementalKiller(보충), publishable(온보딩 lane) 뒤
  const candidatePool: CandidateTopic[] = [...killerCandidates, ...supplementalKiller, ...publishableCandidates]
  console.log(`[ContentCurator] 후보 풀: ${candidatePool.length}개 (killer base=${killerCandidates.length} +보충=${supplementalKiller.length}, publishable=${publishableCandidates.length}, trend lane 제거됨)`)

  // ─── 실행 루프 (Fix 2-C) ──────────────────────────────────────
  // refs=0 / 생성실패 / 발행실패 시 다음 후보로 이동 (continue 기반)
  const topicResults: TopicResult[] = []
  let selfRefUsedCount = 0  // [1단계 가시성] killer self-ref 실사용 횟수(loadEligibleKillerSelfRef 성공 시 +1)

  for (const candidate of candidatePool) {
    if (publishedCount >= maxPosts) break

    const desireCat = candidate.desireCategory ?? guessDesire(candidate.topic)

    // DESIRE_EXHAUSTED: pool 구성 후 루프 중 카운터가 소진된 경우 재확인
    if (isDesireExhausted(desireCat)) {
      topicResults.push({ ...candidate, refsCount: 0, skipReason: 'DESIRE_EXHAUSTED' })
      continue
    }

    // KEYWORD_OVERLAP: 당일 발행 키워드 편중 체크 (P1)
    const topicOverlap = countKeywordOverlap(candidate.topic)
    if (topicOverlap >= 4) {
      console.log(`[ContentCurator] "${candidate.topic}" 키워드 중복 스킵 (당일 ${topicOverlap}회)`)
      topicResults.push({ ...candidate, refsCount: 0, skipReason: 'KEYWORD_OVERLAP' })
      continue
    }

    // [killer self-ref fast lane 2026-07-08] killer candidate 는 이미 cafePostId 를 가진 production 고품질 원문.
    //   generateCuratedPost 가 mainRef(refs[0]) 1개만 사용하므로, 원문이 발행 자격을 충족하면 다른 refs 재검색 없이
    //   그 원문 자체를 refs[0] 로 쓴다(AI 호출 0, DB write 없음). 자격 미달·shadow·trend candidate 는 기존 getReferencePosts fallback.
    const selfRef = ((candidate.source === 'killer' || candidate.source === 'publishable') && candidate.cafePostId)
      ? await loadEligibleKillerSelfRef(candidate.cafePostId, desireCat)
      : null

    // [B 2026-06-10] refs를 먼저 가져와 발행 게시판(A 가드 반영)을 정한 뒤, 그 게시판 소속 페르소나 중에서 글 제목으로 매칭
    let candidatesBeforeUsableFilter = 0
    let maxUsableCount = 0
    let refs: Awaited<ReturnType<typeof getReferencePosts>>['refs']
    let usedConditionalU4 = false
    let refsQuarantinedCount = 0  // [Phase 0-c] 당일 격리로 걸러진 refs 수 (REFS_EMPTY 오라벨 방지용)
    // [ref 계측 2026-07-29] 관측 전용 — 여기 담기는 값은 후보 선택·정렬·발행에 일절 쓰이지 않는다.
    //   목적: 발행 원문이 어느 fallback stage에서 나왔고 그 stage의 source 분포가 어땠는지 확정.
    let refMetrics: Pick<TopicResult, 'refStage' | 'refPoolSize' | 'refCandidateSourceCounts'> = {}

    if (selfRef) {
      refs = [selfRef]
      maxUsableCount = computeUsableCount(selfRef.topComments)
      selfRefUsedCount++
      refMetrics = { refStage: 'self', refPoolSize: 1, refCandidateSourceCounts: { [selfRef.cafeId ?? 'unknown']: 1 } }
    } else {
      // [REFS_EMPTY fix 2026-07-10] 당일 격리 Set을 전달해 slice(limit) 이전에 선제 제외 — 아래 사후 filter는 이중 방어
      const refResult = await getReferencePosts(candidate.topic, desireCat, 3, quarantinedPostIds)
      candidatesBeforeUsableFilter = refResult.candidatesBeforeUsableFilter
      maxUsableCount = refResult.maxUsableCount
      refMetrics = {
        refStage: refResult.refStage,
        refPoolSize: refResult.refPoolSize,
        refCandidateSourceCounts: refResult.refCandidateSourceCounts,
      }
      // [Phase 0-c] 오늘 DUP/POL로 차단됐던 글은 refs로도 재사용 금지 — 같은 발행물로 수렴해 반복 차단되는 루프 제거
      refs = refResult.refs.filter(r => !quarantinedPostIds.has((r as unknown as { id: string }).id))
      refsQuarantinedCount = refResult.refs.length - refs.length

      // usable>=5 후보가 전무(LOW_USABLE)하고 flag ON·회차 1건 미만이면, 안전한 usable==4 후보 1개로 fallback.
      // 기본 usable>=5 경로는 그대로. flag OFF면 아래 블록은 실행되지 않음(현행과 100% 동일).
      if (refs.length === 0 && candidatesBeforeUsableFilter > 0 && ENABLE_CONDITIONAL_USABLE4 && conditionalU4Used < 1) {
        const u4Ref = pickConditionalUsable4(refResult.u4Pool.filter(p => !quarantinedPostIds.has(p.id)))
        if (u4Ref) { refs = [u4Ref]; usedConditionalU4 = true }
      }
    }

    if (refs.length === 0) {
      if (candidatesBeforeUsableFilter > 0 && refsQuarantinedCount === 0) {
        // refs는 있었지만 usable<5로 전부 탈락 — topicResults에 기록 (별도 BotLog 없음)
        topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: 0, skipReason: 'LOW_USABLE_COMMENTS', candidatesBeforeUsableFilter, maxUsableCount, requiredUsableCount: 5 })
      } else {
        // 격리 필터로 비워진 경우 포함 — usable 문제가 아니므로 REFS_EMPTY로 기록
        topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: 0, skipReason: 'REFS_EMPTY' })
      }
      continue
    }

    // [age-fit 1차 기계필터 2026-07-11] 발행물(refs[0]) 최종 게이트 — filterBlocked/self-ref 게이트의
    //   이중 방어 + usable4 조건부 경로 커버. 사유를 matchedKeyword로 BotLog topicResults에 남긴다.
    const mainRefText = refs[0] as unknown as { title: string; content: string }
    const ageFitMain = findAgeFitViolation(mainRefText.title, mainRefText.content)
    if (ageFitMain) {
      console.log(`[ContentCurator] age-fit 발행 차단(${ageFitMain}): "${mainRefText.title.slice(0, 24)}"`)
      topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: 'AGE_FIT_BLOCK', matchedKeyword: ageFitMain, ...refMeta(refs[0]) })
      continue
    }

    // 페르소나 선택 — 발행 게시판 소속(board 필터) + 글 제목 기반 매칭 + AUTHOR_DAILY_CAP 체크
    const board = resolveBoardForPost(refs[0].desireCategory, mainRefText.title, mainRefText.content)
    const personaTargetBoard = personaBoardForRouting(board.boardType)
    let persona = matchPersona(refs[0].title, desireCat, personaTargetBoard)
    const todayCount = await countTodayPostsByPersona(persona.id)
    if (todayCount >= AUTHOR_DAILY_POST_CAP) {
      const allowedPersonaIds = new Set(personaIdsForRoutingBoard(personaTargetBoard))
      let altIds = (DESIRE_PERSONA_MAP[desireCat] ?? DESIRE_PERSONA_MAP['GENERAL'])
        .filter(id => allowedPersonaIds.has(id))
      if (altIds.length === 0) altIds = Array.from(allowedPersonaIds)
      let found = false
      for (const altId of altIds) {
        if (altId === persona.id) continue
        const altCount = await countTodayPostsByPersona(altId)
        if (altCount < AUTHOR_DAILY_POST_CAP) {
          const altPersona = PERSONAS.find(p => p.id === altId)
          if (altPersona) { persona = altPersona; found = true; break }
        }
      }
      if (!found) {
        console.log(`[ContentCurator] "${candidate.topic}" 모든 페르소나 일간 한도 초과 — 스킵`)
        topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: 'AUTHOR_DAILY_CAP', ...refMeta(refs[0]) })
        continue
      }
    }
    console.log(`[ContentCurator] "${candidate.topic}" (${desireCat}) → ${board.boardType}/${board.category} → ${persona.nickname} (참고글 ${refs.length}개)`)

    // [PR-2 Haiku dry-run] 발행 직전 main ref 1건만 품질 판정 — 기록 전용, 차단 없음.
    //   REJECT여도 발행은 계속된다(wouldReject만 남김). 실패 시 haikuStatus='ERROR' 후 발행 지속.
    const mainRef = refs[0] as unknown as { id: string; title: string; content: string | null }
    const haikuResult: HaikuQualityResult = await evaluateContentQualityWithHaiku({
      cafePostId: mainRef.id,
      title: mainRef.title,
      content: mainRef.content ?? '',
      boardType: board.boardType,
    })
    const haiku = summarizeHaikuResult(haikuResult)
    // [PR-3 enforcement] 고신뢰 REJECT + 차단 축 risk만 실제 차단 (HAIKU_GATE_MODE=enforce에서만).
    // NEEDS_REVIEW/thin·board_mismatch 단독/실패·timeout은 차단하지 않는다 — 발행 지속.
    const haikuGateMode = resolveHaikuGateMode(process.env.HAIKU_GATE_MODE)
    if (shouldBlockPublish(haikuResult, haikuGateMode)) {
      const blocked = haikuResult as Extract<HaikuQualityResult, { haikuStatus: 'OK' | 'CACHED' }>
      const refCafeId = (refs[0] as unknown as { cafeId?: string | null }).cafeId ?? null
      await recordHaikuBlocked({
        title: mainRef.title,
        cafePostId: mainRef.id,
        cafeId: refCafeId,
        source: 'CONTENT_CURATE',
        decision: blocked.decision,
        confidence: blocked.confidence,
        risks: blocked.risks,
        reason: blocked.reason,
        boardType: board.boardType,
        category: board.category ?? null,
        refSourceStage: refCafeId ? sourceStageOfCafe(refCafeId) : undefined,
        mode: haikuGateMode,
      })
      console.log(`[ContentCurator] HAIKU_BLOCKED (${blocked.risks.join(',')}, conf=${blocked.confidence}): "${mainRef.title.slice(0, 30)}" — 발행 차단`)
      topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: 'HAIKU_BLOCKED', ...refMeta(refs[0]), haiku })
      continue
    }
    if (haikuResult.haikuStatus !== 'ERROR' && haikuResult.wouldReject) {
      console.log(`[ContentCurator] Haiku ${haikuGateMode === 'enforce' ? 'REJECT(비차단 축/저신뢰)' : 'dry-run wouldReject'} (${haikuResult.speakerRole}/${haikuResult.risks.join(',')}): "${mainRef.title.slice(0, 30)}" — 발행은 계속`)
    }

    const generated = await generateCuratedPost(persona, candidate.topic, refs, desireCat)
    if (!generated.ok) {
      // refs는 있었지만 생성이 불가했던 경우 — 사유를 세분화해 기록한다.
      // (후보 필터가 선제 제외하므로 정상 운영에서는 거의 발생하지 않아야 한다)
      topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: generated.reason, ...refMeta(refs[0]), haiku })
      continue
    }
    const curated = generated.curated

    const publishResult = await publishCuratedContent(curated)
    if (!publishResult.success) {
      topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: publishResult.skipReason, matchedKeyword: publishResult.matchedKeyword, ...refMeta(refs[0]), haiku })
      continue
    }

    // 발행 성공
    topicResults.push({ ...candidate, ...refMetrics, refDiversityApplied: false, refsCount: refs.length, skipReason: null, ...refMeta(refs[0]), routingDesire: board.routingDesire, routingGuard: board.routingGuard, haiku })
    publishedCount++
    if (publishResult.seoTransformed) seoTransformedCount++
    else seoFallbackCount++
    if (usedConditionalU4) { conditionalU4Used++; conditionalU4PublishedCount++ }
    desireUsedCount[desireCat] = (desireUsedCount[desireCat] ?? 0) + 1
    console.log(`[ContentCurator] 게시: "${curated.title}" by ${persona.nickname}`)

    // persona matcher shadow — 실발행 author는 위 로직 그대로, 신 matcher 추천만 BotLog 기록 (PERSONA_MATCHER_MODE, 실패 무영향)
    await recordPersonaMatcherShadow({
      postId: publishResult.postId ?? '',
      title: curated.title,
      content: curated.content,
      boardType: curated.boardType,
      category: curated.category ?? null,
      actualPersonaId: persona.id,
    })

    // 댓글 파동 큐 등록 — WAVE_SKIP_USABLE_ZERO: refs 필터 통과 후에도 usable=0이면 최후 방어선 BotLog
    const refCafePost = refs[0]
    const usable = computeUsableCount(refCafePost?.topComments)
    if (usable === 0) {
      console.log(`[ContentCurator] 댓글 없는 글 — wave queue 생략 postId=${publishResult.postId}`)
      await prisma.botLog.create({ data: {
        botType: 'CAFE_CRAWLER', action: 'WAVE_SKIP_USABLE_ZERO', status: 'SKIP',
        details: JSON.stringify({
          postId: publishResult.postId,
          cafePostId: refCafePost?.id,
          topCommentsCount: Array.isArray(refCafePost?.topComments) ? refCafePost.topComments.length : 0,
        }),
      }}).catch(e => console.error('[ContentCurator] WAVE_SKIP_USABLE_ZERO log 실패:', e))
    } else {
      await enqueueCommentWave(publishResult.postId, refCafePost!.id, persona.id).catch(async (err) => {
        await sendSlackMessage('QA', `[큐레이션] wave 등록 실패: ${String(err).slice(0, 100)}`)
        console.error('[ContentCurator] wave 큐 등록 실패:', err)
      })
    }
  }

  // [1단계 가시성] source(killer/trend)별 skip/published 집계 — "왜 0개 게시됐는지" 즉시 판독용.
  const skipBySource: Record<string, Record<string, number>> = {}
  const publishedBySource: Record<string, number> = {}
  for (const r of topicResults) {
    if (r.skipReason) {
      if (!skipBySource[r.source]) skipBySource[r.source] = {}
      skipBySource[r.source][r.skipReason] = (skipBySource[r.source][r.skipReason] ?? 0) + 1
    } else {
      publishedBySource[r.source] = (publishedBySource[r.source] ?? 0) + 1
    }
  }

  const durationMs = Date.now() - startTime
  const status = publishedCount >= maxPosts ? 'SUCCESS' : publishedCount > 0 ? 'PARTIAL' : 'FAILED'
  const repeatedZeroPublishAlert = status === 'FAILED' && publishedCount === 0
    ? await getRepeatedZeroPublishAlert(topicResults)
    : null

  // [source diversity] 이번 회차 발행 참조(cafeId) 분포 — 편중 관찰 계측(플래그 off여도 기록해 before/after 비교 가능)
  const publishedCafeIds: Record<string, number> = await prisma.cafePost
    .groupBy({ by: ['cafeId'], where: { usedAt: { gte: new Date(startTime) } }, _count: true })
    .then((g) => Object.fromEntries(g.map((x) => [x.cafeId, x._count])))
    .catch(() => ({}))

  // BotLog — topicsUsed: 실제 시도한 topic만 (candidatePool 전체 아님)
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'CONTENT_CURATE',
      status,
      details: JSON.stringify({
        topicsUsed: topicResults.map(r => r.topic),
        candidatePoolSize: candidatePool.length,
        // [1단계 가시성 + 2단계 보충] 기존 필드 유지, killerCandidateCount 는 final(base+보충) 의미로 기록(숫자만 증가, 파서 호환)
        killerCandidateCount: killerCandidates.length + supplementalKiller.length,  // final killer 수
        baseKillerCandidateCount: killerCandidates.length,
        supplementalKillerCandidateCount: supplementalKiller.length,
        finalKillerCandidateCount: killerCandidates.length + supplementalKiller.length,
        trendCandidateCount: 0,  // [trend 제거 1차] lane 삭제 — 파서 호환용 0 고정
        trendLaneRemoved: true,
        // [Phase 1-b] publishable lane 카운트 (additive — 기존 필드 제거·개명 없음). lane이 보충 전용이라 두 값 동일.
        publishableCandidateCount: publishableCandidates.length,
        supplementalPublishableCandidateCount: publishableCandidates.length,
        // [source diversity 1차 실험] additive 계측 — 편중 관찰용(파서 호환: 신규 키만 추가)
        sourceDiversity: {
          enabled: SOURCE_DIVERSITY_SORT,
          usedShare7d: usedShare7d ? Object.fromEntries([...usedShare7d.entries()].map(([c, s]) => [c, Math.round(s * 1000) / 1000])) : null,
          publishedCafeIds,
        },
        selfRefUsedCount,
        skipBySource,
        publishedBySource,
        published: publishedCount,
        seoTransformedCount,
        seoFallbackCount,
        conditionalU4CandidateCount,
        conditionalU4PublishedCount,
        conditionalU4SkippedCount,
        medicalAdviceSkippedCount,
        topicResults,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: repeatedZeroPublishAlert ? 'important' : 'info',
    agent: 'CONTENT_CURATOR',
    title: '트렌드 기반 콘텐츠 게시',
    body: [
      `source-backed 후보 ${candidatePool.length}개 중 ${publishedCount}개 글 게시`,
      repeatedZeroPublishAlert
        ? `⚠️ 같은 사유(${repeatedZeroPublishAlert.reason})로 CONTENT_CURATE 0개 발행이 ${repeatedZeroPublishAlert.count}회 연속 발생했습니다. 즉시 원인 확인이 필요합니다.`
        : null,
    ].filter(Boolean).join('\n\n'),
  })

  console.log(`[ContentCurator] 완료 — ${publishedCount}개 게시, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[ContentCurator] 치명적 오류:', err)
      await disconnect()
      process.exit(1)
    })
}
