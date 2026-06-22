/**
 * 매거진 SEO 키워드 — 분류·스코어링 (타입 허브)
 *
 * // LOCAL ONLY — 1회성 키워드 리서치 도구. cron/GitHub Actions/runner.ts 미등록.
 *
 * 책임:
 *  - KeywordNode 타입 정의 (raw universe 1건)
 *  - publishPolicy 분류 (모든 키워드는 수집, 발행 여부만 분리)
 *  - score 계산 (자동완성 빈도 / depth / GSC near-miss / 브랜드핏 / 민감도)
 *
 * 정책 (창업자 확정 2026-06-22):
 *  - 모든 키워드는 raw universe에 보관한다. publishPolicy만 분리한다.
 *  - "만남"은 무조건 off-brand가 아니다 (중년/친구/커뮤니티 만남은 관계·커뮤니티로 보관).
 *    연하남/애인/불륜/바람/20·30대 남자만 no_publish_off_brand.
 *  - "디시"/"82cook"은 삭제가 아니라 UGC/SERP 신호 → no_publish_research.
 */

// ─── 타입 ────────────────────────────────────────────────

export type ClusterId =
  | '갱년기건강'
  | '부부성건강'
  | '외로움관계'
  | '일자리'
  | '돈연금'
  | '패션생활'

export type Intent = '정보' | '질문' | '방법' | '비교' | '계산' | '탐색' | '상업'

export type Sensitivity = 'none' | 'low' | 'medium' | 'high'

export type PublishPolicy =
  | 'publish'
  | 'publish_softened_title'
  | 'no_publish_research'
  | 'no_publish_off_brand'

export type TitlePolicy = 'as_is' | 'softened'

export type KeywordSource = 'seed' | 'autocomplete' | 'gsc' | 'serp_pasf' | 'serp_paa'

export interface GscSignal {
  impressions: number
  clicks: number
  position: number
  ctr: number
}

/** raw keyword universe 1건 */
export interface KeywordNode {
  keyword: string
  normalized: string
  source: KeywordSource
  parentKeyword: string | null
  depth: number
  cluster: ClusterId | 'uncategorized'
  intent: Intent
  sensitivity: Sensitivity
  publishPolicy: PublishPolicy
  titlePolicy: TitlePolicy
  relatedKeywords: string[]
  gsc: GscSignal | null
  demandSignal: number
  score: number
  status: 'candidate' | 'clustered' | 'queued' | 'published'
}

/** 시드 입력 (seeds.ts) */
export interface SeedKeyword {
  keyword: string
  cluster: ClusterId
  intent: Intent
  sensitivity: Sensitivity
}

// ─── 패턴 (분류 기준) ─────────────────────────────────────

/** off-brand — 발행 큐 제외(raw 보관). "만남"은 포함하지 않는다(일반 만남 허용). */
const OFF_BRAND_PATTERNS: RegExp[] = [
  /연하남/, /애인/, /불륜/, /바람/, /20대\s*남자/, /30대\s*남자/, /내연/,
]

/** UGC/커뮤니티 신호 — 발행 안 함, SERP 침투 신호로만 보관 */
const UGC_SIGNAL_PATTERNS: RegExp[] = [/디시/, /dc인사이드/i, /82cook/i, /에펨코리아/, /더쿠/]

/** 상업·내비형 저정보 — 정보성 아님, 보관만 */
const COMMERCIAL_NAV_PATTERNS: RegExp[] = [/의류\s*브랜드/, /쇼핑몰/, /옷\s*브랜드/, /최저가/]

/** 노골적 high 민감 — 표현 자체가 자극 → 보관(발행 X) */
const HIGH_EXPLICIT_PATTERNS: RegExp[] = [/성욕/, /성\s*횟수/, /욕구/]

/** 재구성 가능 민감 — 제목 순화 발행 */
const SOFTENED_PATTERNS: RegExp[] = [/부부관계/, /성건강/, /질건조/, /관계\s*변화/, /부부\s*생활/, /부부\s*관계/]

// ─── 정규화 (dedupe 키) ──────────────────────────────────

/** 공백·기호 제거 후 글자 정렬 — 어순/띄어쓰기만 다른 쌍둥이를 같은 값으로 */
export function normalizeKeyword(keyword: string): string {
  return keyword
    .replace(/[^가-힣0-9a-zA-Z]/g, '')
    .split('')
    .sort()
    .join('')
}

// ─── 민감도 추정 (자동완성 파생 키워드용) ─────────────────

export function evaluateSensitivity(keyword: string): Sensitivity {
  if (HIGH_EXPLICIT_PATTERNS.some((re) => re.test(keyword))) return 'high'
  if (OFF_BRAND_PATTERNS.some((re) => re.test(keyword))) return 'high'
  if (SOFTENED_PATTERNS.some((re) => re.test(keyword)) || /이혼/.test(keyword)) return 'medium'
  if (/외로움|심리|만남|연애|혼자/.test(keyword)) return 'low'
  return 'none'
}

// ─── 브랜드핏 ────────────────────────────────────────────

/** 0.2 / 0.6 / 1.0 */
export function estimateBrandFit(keyword: string, cluster: ClusterId | 'uncategorized'): number {
  if (COMMERCIAL_NAV_PATTERNS.some((re) => re.test(keyword)) || /의류|쇼핑몰/.test(keyword)) {
    return 0.2
  }
  if (
    cluster === '갱년기건강' ||
    cluster === '외로움관계' ||
    cluster === '일자리' ||
    /갱년기|외로움|친구|커뮤니티|일자리|취업|연금|퇴직|건강/.test(keyword)
  ) {
    return 1.0
  }
  return 0.6
}

// ─── publishPolicy 분류 (결정 트리 — 위→아래 우선) ────────

export function classifyPublishPolicy(
  keyword: string,
  sensitivity: Sensitivity,
): { publishPolicy: PublishPolicy; titlePolicy: TitlePolicy } {
  if (OFF_BRAND_PATTERNS.some((re) => re.test(keyword))) {
    return { publishPolicy: 'no_publish_off_brand', titlePolicy: 'as_is' }
  }
  if (UGC_SIGNAL_PATTERNS.some((re) => re.test(keyword))) {
    return { publishPolicy: 'no_publish_research', titlePolicy: 'as_is' }
  }
  if (COMMERCIAL_NAV_PATTERNS.some((re) => re.test(keyword))) {
    return { publishPolicy: 'no_publish_research', titlePolicy: 'as_is' }
  }
  if (HIGH_EXPLICIT_PATTERNS.some((re) => re.test(keyword))) {
    return { publishPolicy: 'no_publish_research', titlePolicy: 'as_is' }
  }
  if (
    SOFTENED_PATTERNS.some((re) => re.test(keyword)) ||
    sensitivity === 'medium' ||
    sensitivity === 'high'
  ) {
    return { publishPolicy: 'publish_softened_title', titlePolicy: 'softened' }
  }
  return { publishPolicy: 'publish', titlePolicy: 'as_is' }
}

// ─── score 계산 ──────────────────────────────────────────

export interface ScoreParams {
  /** 자동완성 빈도 정규화 상한 (이 횟수 이상이면 1.0) */
  freqCap: number
  /** UGC 침투 가능성 (0~1) — P2 SERP 분석 후 보강. P1에선 0 */
  ugcPenetration: number
}

export const DEFAULT_SCORE_PARAMS: ScoreParams = { freqCap: 5, ugcPenetration: 0 }

const SENSITIVITY_PENALTY: Record<Sensitivity, number> = {
  none: 0,
  low: 0.05,
  medium: 0.15,
  high: 0.3,
}

function gscSignalScore(gsc: GscSignal | null): number {
  if (!gsc) return 0
  const imprPart = Math.min(Math.log10(gsc.impressions + 1) / 2, 1)
  let posBonus = 0
  if (gsc.position >= 8 && gsc.position <= 20) posBonus = 0.3
  else if (gsc.position > 20 && gsc.position <= 50) posBonus = 0.15
  return Math.min(imprPart + posBonus, 1)
}

/**
 * score = 0.30·freqNorm + 0.15·depthDecay + 0.25·gscSignal + 0.30·brandFit − penalty
 * (+ P2에서 ugcPenetration 가중 보강)
 */
export function computeScore(
  node: Pick<KeywordNode, 'demandSignal' | 'depth' | 'gsc' | 'keyword' | 'cluster' | 'sensitivity'>,
  params: ScoreParams = DEFAULT_SCORE_PARAMS,
): number {
  const freqNorm = Math.min(node.demandSignal / params.freqCap, 1)
  const depthDecay = 1 / (1 + node.depth)
  const gscSig = gscSignalScore(node.gsc)
  const brandFit = estimateBrandFit(node.keyword, node.cluster)
  const penalty = SENSITIVITY_PENALTY[node.sensitivity]

  const raw =
    0.3 * freqNorm +
    0.15 * depthDecay +
    0.25 * gscSig +
    0.3 * brandFit +
    0.2 * params.ugcPenetration -
    penalty

  return Math.round(Math.max(raw, 0) * 1000) / 1000
}
