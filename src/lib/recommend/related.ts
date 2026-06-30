/**
 * 관련글 추천 v1 — 맥락(같은 주제·제목/요약 키워드) × 흥미도(댓글·공감·조회·트렌딩·최신) 점수화.
 *
 * 순수 함수 모듈: DB·React·외부 API·임베딩 의존 0. 입력(현재 글 + 후보 배열)만으로 결정.
 * 후보 pool은 호출자(서버)가 getRelatedCommunityPosts 로 가볍게 뽑아 넘긴다. 여기서 제외·정렬·이유만 계산.
 *
 * 튜닝은 REC_WEIGHTS 상수만 바꾼다. 롤백 = weight 0 또는 호출 제거(기존 trendingScore 정렬 복귀).
 */
import type { PostSummary, BoardType } from '@/types/api'
import { GREETING_CATEGORY } from '@/lib/greeting'

/** 알고리즘 버전 — tracking properties 에 동봉해 버전별 효과 비교 */
export const REC_ALGO_VERSION = 'rec_v1_2026-06-23'

/** 점수 항목별 최대 가중치 (정규화된 0~1 비율 × weight). 한 곳에서만 관리 */
export const REC_WEIGHTS = {
  sameCategory: 30,
  titleOverlap: 20,
  previewOverlap: 10,
  trending: 15,
  comment: 12,
  like: 8,
  view: 5,
  recency7: 8,
  recency30: 4,
} as const

export type RecommendReason = 'topic' | 'comment' | 'like' | 'trending' | 'recent'

/** 사용자 노출용 reason 라벨 */
export const REASON_LABEL: Record<RecommendReason, string> = {
  topic: '같은 주제',
  comment: '댓글 많은 글',
  like: '많이 공감한 글',
  trending: '요즘 많이 보는 글',
  recent: '최근 이야기',
}

export interface ScoredPost {
  post: PostSummary
  score: number
  reason: RecommendReason
  rank: number // 1-based 노출 순위
}

export interface ScoreCurrent {
  id: string
  category: string | null
  title: string
  preview: string
  /** v2 전용 — 크로스보드 판별용. v1은 무시(미전달 시 영향 0) */
  boardType?: BoardType
}

export interface ScoreOpts {
  /** 현재 글 외 추가 제외(이번 세션에서 본 글 등) */
  excludeIds: string[]
  /** 기준 시각(ms) — recency 계산. 테스트 결정성 위해 주입 */
  now: number
  /** 노출 개수(기본 3) */
  take?: number
}

// 한글/영문 토큰화 — 흔한 불용어 제거 + 2글자 이상만. 정규식 1회·상수시간.
const STOPWORDS = new Set([
  '그리고', '하지만', '그런데', '그래서', '이런', '저런', '그냥', '정말', '너무', '진짜',
  '우리', '내가', '나는', '저는', '에서', '으로', '하는', '있는', '없는', '되는', '같은',
])
function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

/** 두 토큰 집합의 교집합 비율(현재 글 기준) × weight. 0~weight */
function overlapScore(curTokens: string[], candTokens: string[], weight: number): number {
  if (curTokens.length === 0 || candTokens.length === 0) return 0
  const candSet = new Set(candTokens)
  const curSet = new Set(curTokens)
  let hit = 0
  for (const t of curSet) if (candSet.has(t)) hit++
  return (hit / curSet.size) * weight
}

interface ScoreParts {
  category: number
  titleOverlap: number
  previewOverlap: number
  trending: number
  comment: number
  like: number
  view: number
  recency: number
}

function decideReason(p: ScoreParts): RecommendReason {
  // topic = 맥락(같은 주제 + 키워드) 합산 강조. 나머지는 흥미도 단일 항목.
  const groups: Record<RecommendReason, number> = {
    topic: p.category + p.titleOverlap + p.previewOverlap,
    comment: p.comment,
    like: p.like,
    trending: p.trending + p.view,
    recent: p.recency,
  }
  let best: RecommendReason = 'topic'
  let bestVal = -1
  // 객체 순서(topic 먼저)로 동점 시 맥락 우선
  for (const k of ['topic', 'comment', 'like', 'trending', 'recent'] as RecommendReason[]) {
    if (groups[k] > bestVal) {
      bestVal = groups[k]
      best = k
    }
  }
  return best
}

/**
 * 후보 중 현재 글·본 글·가입인사 제외 후 점수화 → 상위 take개 반환.
 * 후보가 0이면 빈 배열(호출자는 카드 미노출).
 */
export function scoreRelated(
  current: ScoreCurrent,
  candidates: PostSummary[],
  opts: ScoreOpts,
): ScoredPost[] {
  const { excludeIds, now, take = 3 } = opts
  const exclude = new Set<string>([current.id, ...excludeIds])
  // 제외: 현재 글 / 이미 본 글 / 가입인사(category). 후보는 호출자가 PUBLISHED 만 전달(숨김·삭제 사전 배제).
  const pool = candidates.filter((c) => !exclude.has(c.id) && c.category !== GREETING_CATEGORY)
  if (pool.length === 0) return []

  // 흥미도 정규화 기준(pool 내 최대) — 0 division 방지로 최소 1
  const maxTrending = Math.max(1, ...pool.map((c) => c.trendingScore))
  const maxComment = Math.max(1, ...pool.map((c) => c.commentCount))
  const maxLike = Math.max(1, ...pool.map((c) => c.likeCount))
  const maxView = Math.max(1, ...pool.map((c) => c.viewCount))

  const curTitle = tokenize(current.title)
  const curPreview = tokenize(current.preview)
  const curCategory = current.category

  const scored = pool.map((c) => {
    const parts: ScoreParts = {
      category: curCategory && c.category === curCategory ? REC_WEIGHTS.sameCategory : 0,
      titleOverlap: overlapScore(curTitle, tokenize(c.title), REC_WEIGHTS.titleOverlap),
      previewOverlap: overlapScore(curPreview, tokenize(c.preview), REC_WEIGHTS.previewOverlap),
      trending: (c.trendingScore / maxTrending) * REC_WEIGHTS.trending,
      comment: (c.commentCount / maxComment) * REC_WEIGHTS.comment,
      like: (c.likeCount / maxLike) * REC_WEIGHTS.like,
      view: (c.viewCount / maxView) * REC_WEIGHTS.view,
      recency: 0,
    }
    const ageDays = (now - Date.parse(c.createdAt)) / 86400000
    parts.recency = ageDays <= 7 ? REC_WEIGHTS.recency7 : ageDays <= 30 ? REC_WEIGHTS.recency30 : 0

    const score =
      parts.category + parts.titleOverlap + parts.previewOverlap + parts.trending +
      parts.comment + parts.like + parts.view + parts.recency
    return { post: c, score, reason: decideReason(parts) }
  })

  scored.sort((a, b) => b.score - a.score || Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt))
  return scored.slice(0, take).map((s, i) => ({ ...s, rank: i + 1 }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 관련글 추천 v2 (A/B 실험 arm) — 후보 품질 개선.
//   목적: 네이버 랜딩(토픽성 유입)의 next-page 이동률↑. 같은 category 우선 + 제목/요약 키워드 가중 강화
//        + 부족 시 크로스보드(stories/life2/humor) fallback(키워드 hit 있는 후보만).
//   v1은 한 줄도 바꾸지 않는다(scoreRelated 그대로 = control). v2는 본 함수만 사용.
// ─────────────────────────────────────────────────────────────────────────────

export const REC_ALGO_VERSION_V2 = 'rec_v2_2026-06-30'

/** v2 가중치 — 키워드(제목/요약) 비중을 v1보다 크게(토픽 적합도 우선). */
export const REC_WEIGHTS_V2 = {
  sameCategory: 30,
  titleOverlap: 36, // v1 20 → 강화
  previewOverlap: 18, // v1 10 → 강화
  trending: 12,
  comment: 10,
  like: 6,
  view: 4,
  recency7: 8,
  recency30: 4,
} as const

/** 무관글 차단 — 토픽 신호(같은 category 또는 키워드 overlap>0)가 있어야 후보 자격. 크로스보드는 키워드 hit 필수. */
function v2Parts(current: ScoreCurrent, c: PostSummary, curTitle: string[], curPreview: string[], now: number, maxes: { t: number; c: number; l: number; v: number }) {
  const sameCat = current.category && c.category === current.category
  const titleOverlap = overlapScore(curTitle, tokenize(c.title), REC_WEIGHTS_V2.titleOverlap)
  const previewOverlap = overlapScore(curPreview, tokenize(c.preview), REC_WEIGHTS_V2.previewOverlap)
  const parts: ScoreParts = {
    category: sameCat ? REC_WEIGHTS_V2.sameCategory : 0,
    titleOverlap,
    previewOverlap,
    trending: (c.trendingScore / maxes.t) * REC_WEIGHTS_V2.trending,
    comment: (c.commentCount / maxes.c) * REC_WEIGHTS_V2.comment,
    like: (c.likeCount / maxes.l) * REC_WEIGHTS_V2.like,
    view: (c.viewCount / maxes.v) * REC_WEIGHTS_V2.view,
    recency: 0,
  }
  const ageDays = (now - Date.parse(c.createdAt)) / 86400000
  parts.recency = ageDays <= 7 ? REC_WEIGHTS_V2.recency7 : ageDays <= 30 ? REC_WEIGHTS_V2.recency30 : 0
  const keywordHit = titleOverlap > 0 || previewOverlap > 0
  const score = parts.category + parts.titleOverlap + parts.previewOverlap + parts.trending + parts.comment + parts.like + parts.view + parts.recency
  return { parts, score, sameCat: !!sameCat, keywordHit }
}

export function scoreRelatedV2(
  current: ScoreCurrent,
  candidates: PostSummary[],
  opts: ScoreOpts,
): ScoredPost[] {
  const { excludeIds, now, take = 3 } = opts
  const exclude = new Set<string>([current.id, ...excludeIds])
  const pool = candidates.filter((c) => !exclude.has(c.id) && c.category !== GREETING_CATEGORY)
  if (pool.length === 0) return []

  const maxes = {
    t: Math.max(1, ...pool.map((c) => c.trendingScore)),
    c: Math.max(1, ...pool.map((c) => c.commentCount)),
    l: Math.max(1, ...pool.map((c) => c.likeCount)),
    v: Math.max(1, ...pool.map((c) => c.viewCount)),
  }
  const curTitle = tokenize(current.title)
  const curPreview = tokenize(current.preview)
  const curBoard = current.boardType

  const evaluated = pool.map((c) => {
    const r = v2Parts(current, c, curTitle, curPreview, now, maxes)
    const crossBoard = curBoard !== undefined && c.boardType !== curBoard
    // 토픽 자격: 같은 category 또는 키워드 hit. 크로스보드는 키워드 hit 필수(인기만으로 못 들어옴).
    const topical = crossBoard ? r.keywordHit : (r.sameCat || r.keywordHit)
    return { post: c, score: r.score, reason: decideReason(r.parts), crossBoard, topical }
  })

  const byScore = (a: { score: number; post: PostSummary }, b: { score: number; post: PostSummary }) =>
    b.score - a.score || Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt)

  // 1순위: 토픽 적합 후보(무관글 차단). 부족하면 같은 보드 인기/최신으로 채워 v1 대비 노출 수 감소 방지.
  const topical = evaluated.filter((e) => e.topical).sort(byScore)
  let chosen = topical
  if (chosen.length < take) {
    const filler = evaluated
      .filter((e) => !e.topical && (curBoard === undefined || e.post.boardType === curBoard))
      .sort(byScore)
    chosen = [...topical, ...filler.slice(0, take - topical.length)]
  }
  return chosen.slice(0, take).map((s, i) => ({ post: s.post, score: s.score, reason: s.reason, rank: i + 1 }))
}
