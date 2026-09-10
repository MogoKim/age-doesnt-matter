/**
 * 네이버 카페 유래 데이터 영구 폐기 — **순수 판정 모듈** (I/O 없음).
 *
 * 존재 이유: dry-run 과 실제 실행이 **같은 판정**을 쓰게 만든다.
 * 이 파일에는 네트워크·DB 접근이 없다 — 전부 순수 함수라 테스트로 고정할 수 있다.
 *
 * 정책 출처: 창업자 결정(2026-09-10)
 * 측정 근거: `docs/operations/2026-09-10-naver-cafe-purge-facts.md`
 */
import { createHash } from 'node:crypto'

/**
 * production Supabase project ref allowlist.
 *
 * ref 평문을 적지 않고 **SHA-256 해시로만** 둔다 — 이 저장소는 공개이고
 * ref 는 배포 산출물에도 없다. 해시 대조로도 allowlist 는 그대로 작동한다.
 */
export const PRODUCTION_PROJECT_REF_SHA256 = '6df9dc71f519af491447c292eac9b9f704534517c5e9fc4b8e0f9cf3e81b85a5'

export function isProductionProjectRef(ref: string): boolean {
  return createHash('sha256').update(ref).digest('hex') === PRODUCTION_PROJECT_REF_SHA256
}

/**
 * "명시적 네이버 유래 Post" 의 단일 정의.
 * 실측(2026-09-10): cafePostId 6,275 · sourceUrl 1,174 · 합집합 **7,449** (BOT 6,275 · SHEET 1,174).
 * ⚠️ 이 문자열이 대상 정의의 SSoT 다.
 */
export const NAVER_ORIGIN_FILTER = 'or=(cafePostId.not.is.null,sourceUrl.ilike.*cafe.naver.com*)'

/**
 * 🔴 실회원 SSoT — `providerId` 가 **순수 숫자**면 사람이다.
 *
 * 카카오 user ID 는 숫자다. 봇·페르소나 계정은 비숫자 접두어를 쓴다.
 * 접두어 목록(bot·seed·curator 로 시작하는 providerId)으로 세면 7건이 어긋났다 —
 * 숫자 판정이 정본 상태판의 "실회원 188명"과 정확히 일치한다(실측 188 / 봇 320 / 전체 508).
 */
export function isHumanProviderId(providerId: string | null | undefined): boolean {
  return /^\d+$/.test(providerId ?? '')
}

/**
 * 2026-09-10 production 실측 기준선 (실회원 SSoT = 숫자 providerId, FK 는 migration 기준).
 */
export const EXPECTED = {
  postTotal: 11_715,
  naverOrigin: 7_449,
  naverOriginPublic: 0,
  tombstonePosts: 324,
  hardDeletePosts: 7_125,
  botCommentsOnTombstone: 2_545,
  humanCommentsOnTombstone: 71,
  nullAuthorCommentsOnTombstone: 56,
  guestLikesOnNaver: 111,
  reportsOnNaver: 1,
  homeCurationOnNaver: 139,
  cafePost: 33_031,
  cafeTrend: 191,
  commentWaveQueue: 276,
  botLogNaverDerived: 8_861,
  botLogCafeCrawler: 99_026,
  /** CAFE_CRAWLER + 원문 조각 파생 = 폐기 대상 전체 */
  botLogPurgeTargets: 99_578,
  r2Objects: 518,
  humanUsers: 188,
} as const

/**
 * 실제 FK — **Prisma schema 가 아니라 migration SQL 기준**이다. 둘이 어긋난다.
 *
 * schema 는 `HomeCurationOverride` 를 Cascade 로 적어 뒀지만 DB 는 **RESTRICT** 다
 * (`20260601000000_add_home_curation_override`). `Report` 도 init 의 CASCADE 를
 * `20260423000000_..._report_restrict` 가 RESTRICT 로 바꿨다.
 * RESTRICT 는 hard delete 를 **막는다** — 참조가 있는 글은 tombstone 으로 간다.
 */
export const POST_FK_ON_DELETE = {
  Comment: 'CASCADE',
  CpsLink: 'CASCADE',
  GuestLike: 'CASCADE',
  JobDetail: 'CASCADE',
  Like: 'CASCADE',
  PostView: 'CASCADE',
  Scrap: 'CASCADE',
  Notification: 'SET NULL',
  HomeCurationOverride: 'RESTRICT',
  Report: 'RESTRICT',
} as const

export const RESTRICTING_TABLES = (Object.entries(POST_FK_ON_DELETE) as [string, string][])
  .filter(([, v]) => v === 'RESTRICT').map(([k]) => k)

/** Post 한 건의 처분. dry-run 과 execute 가 **이 함수 하나**만 쓴다. */
export type PostDisposition = 'DELETE' | 'TOMBSTONE' | 'PRESERVE'

/** tombstone 사유 — 사람 흔적과 관리자 흔적을 구분해 기록한다(둘 다 보존 대상). */
export type TraceReason =
  | 'comment-human' | 'comment-null' | 'like-human' | 'guestlike' | 'report' | 'home-curation'

export type PostForDecision = {
  source: string
  cafePostId: string | null
  sourceUrl: string | null
  traces: readonly TraceReason[]
}

export function isNaverOrigin(p: Pick<PostForDecision, 'cafePostId' | 'sourceUrl'>): boolean {
  if (p.cafePostId != null) return true
  return (p.sourceUrl ?? '').toLowerCase().includes('cafe.naver.com')
}

export function decidePost(p: PostForDecision): PostDisposition {
  // 🔴 USER 글은 어떤 경우에도 대상이 아니다.
  if (p.source === 'USER') return 'PRESERVE'
  if (!isNaverOrigin(p)) return 'PRESERVE'
  // 사람·관리자 흔적이 있으면 hard delete 가 그것까지 지우거나(CASCADE) FK 로 막힌다(RESTRICT).
  return p.traces.length > 0 ? 'TOMBSTONE' : 'DELETE'
}

/**
 * tombstone 후 남는 필드.
 * 복원 가능한 콘텐츠를 전부 없앤다. `title`·`content` 는 NOT NULL 이라 고정 문구로 덮는다.
 * `category`·`series*`·`controversyChainId` 도 원문 파생이라 함께 비운다
 * (실측: tombstone 324건 중 category 320 · summary 314 · slug 324 · seoTitle 73 · thumbnailUrl 48,
 *  series*·controversyChainId 는 0 이지만 계약으로 고정한다).
 * `status` 는 건드리지 않는다 — 전량 HIDDEN/DELETED 라 공개 상태가 바뀌지 않는다.
 */
export const TOMBSTONE_PATCH = {
  title: '삭제된 글',
  content: '이 글은 삭제되었습니다.',
  summary: null,
  originalTitle: null,
  seoTitle: null,
  seoDescription: null,
  slug: null,
  sourceUrl: null,
  sourceSite: null,
  thumbnailUrl: null,
  cafePostId: null,
  category: null,
  seriesId: null,
  seriesTitle: null,
  seasonId: null,
  controversyChainId: null,
} as const

export const CONTENT_BEARING_FIELDS = Object.keys(TOMBSTONE_PATCH) as (keyof typeof TOMBSTONE_PATCH)[]

export function isTombstoned(row: Record<string, unknown>): boolean {
  return CONTENT_BEARING_FIELDS.every((f) => row[f] === TOMBSTONE_PATCH[f])
}

/** 🔴 fail closed — 후보에 USER Post 가 1건이라도 있으면 던진다. */
export function assertNoUserPosts(rows: { source: string }[]): void {
  const n = rows.filter((r) => r.source === 'USER').length
  if (n > 0) throw new Error(`[FAIL-CLOSED] 후보에 USER Post 가 ${n}건 있다 — 중단한다.`)
}

/** 🔴 무필터 mutation 금지. 전량 삭제도 `id=not.is.null` 처럼 범위를 명시해야 한다. */
export function assertMutationIsScoped(path: string): void {
  const [table, query = ''] = path.split('?')
  const keys = [...new URLSearchParams(query).keys()].filter((k) => !['select', 'limit', 'offset', 'order'].includes(k))
  if (keys.length === 0) throw new Error(`[FAIL-CLOSED] 필터 없는 mutation 요청: ${table} — 중단한다.`)
}

/**
 * 🔴 조회 결과 무결성 — keyset pagination 이 중복·누락 없이 전부 가져왔는지 본다.
 * `exactCount` 는 같은 필터의 `Prefer: count=exact` 값이다.
 */
export function assertPageIntegrity(label: string, ids: string[], exactCount: number): void {
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    throw new Error(`[FAIL-CLOSED] ${label}: 중복 ID ${ids.length - unique.size}건 — 중단한다.`)
  }
  if (unique.size !== exactCount) {
    throw new Error(`[FAIL-CLOSED] ${label}: 조회 ${unique.size}건 ≠ exact count ${exactCount}건 — 누락 의심, 중단한다.`)
  }
}

// ── 진행 단계 ────────────────────────────────────────────────────────────────
/**
 * 실행 순서. **재실행 안전성이 순서를 결정한다.**
 *  - BotLog·R2 는 원문 제목·썸네일 URL 이 있어야 대상을 알 수 있어 **글보다 먼저** 지운다.
 *  - hard delete 를 tombstone 보다 **먼저** 한다. 그래야 tombstone 이 끝나기 전까지
 *    남은 네이버 유래 글이 곧 tombstone 대상이라 중간에 죽어도 대상을 다시 구할 수 있다.
 *    (tombstone 은 `cafePostId`·`sourceUrl` 을 비우므로 필터에서 사라진다)
 */
export const STEPS = [
  'P0-botlog', 'P1-r2', 'P2-hard-delete', 'P3-bot-comments', 'P4-tombstone',
  'P5-comment-wave-queue', 'P6-cafe-trend', 'P7-cafe-post',
] as const
export type StepName = (typeof STEPS)[number]

/** 실행 중/후 라이브 카운트. 재실행 판단과 최종 검증에 같은 값을 쓴다. */
export type LiveCounts = {
  naverOrigin: number
  naverOriginPublic: number
  tombstoneSignature: number
  botCommentsOnNaver: number
  humanCommentsOnTombstone: number
  nullAuthorCommentsOnTombstone: number
  guestLikesOnNaver: number
  reportsOnNaver: number
  homeCurationOnNaver: number
  cafePost: number
  cafeTrend: number
  commentWaveQueue: number
  /** 폐기 대상 BotLog **전체** 잔량 — CAFE_CRAWLER + 원문 조각 파생 로그. CAFE_CRAWLER 만 세면 파생분이 남는다. */
  botLogPurgeTargets: number
  r2Remaining: number
  publicUserPosts: number
}

/**
 * 시작 전 기준선 확인.
 * **재실행을 막지 않는다** — 처음이든 중간이든 "지금까지 줄어든 방향"이면 통과한다.
 * 늘어났거나 보존 대상이 줄었으면 중단한다.
 */
export type Violation = { key: string; expected: string; actual: number }

export function checkStartState(c: LiveCounts, exp: PurgeExpectation): Violation[] {
  const v: Violation[] = []
  const notAbove = (k: keyof LiveCounts, e: number) => {
    if (c[k] > e) v.push({ key: k, expected: `${e} 이하 (폐기는 줄이기만 한다)`, actual: c[k] })
  }
  const eq = (k: keyof LiveCounts, e: number) => {
    if (c[k] !== e) v.push({ key: k, expected: `정확히 ${e}`, actual: c[k] })
  }
  // 줄어드는 방향만 허용 — 재실행에서도 통과한다.
  notAbove('naverOrigin', exp.naverOrigin)
  notAbove('cafePost', exp.cafePost)
  notAbove('cafeTrend', exp.cafeTrend)
  notAbove('commentWaveQueue', exp.commentWaveQueue)
  notAbove('botLogPurgeTargets', exp.botLogPurgeTargets)
  notAbove('r2Remaining', exp.r2Objects)
  // 🔴 보존 대상은 한 건도 줄면 안 된다.
  eq('humanCommentsOnTombstone', exp.humanCommentsOnTombstone)
  eq('nullAuthorCommentsOnTombstone', exp.nullAuthorCommentsOnTombstone)
  eq('guestLikesOnNaver', exp.guestLikesOnNaver)
  eq('reportsOnNaver', exp.reportsOnNaver)
  eq('homeCurationOnNaver', exp.homeCurationOnNaver)
  // 실행 중 실회원이 새 글을 쓸 수 있다 — **늘어나는 것은 허용, 줄어들면 실패.**
  if (c.publicUserPosts < exp.publicUserPosts) v.push({ key: 'publicUserPosts', expected: `${exp.publicUserPosts} 이상`, actual: c.publicUserPosts })
  eq('naverOriginPublic', 0)
  // tombstone 서명이 예상 총량을 넘으면 대상 밖 글을 덮었다는 뜻이다.
  notAbove('tombstoneSignature', exp.tombstonePosts)
  return v
}

/**
 * 🔴 최종 검증. **여기를 통과하기 전에는 done/ok 를 출력하지 않는다.**
 */
export function checkFinalState(c: LiveCounts, exp: PurgeExpectation): Violation[] {
  const v: Violation[] = []
  const zero = (k: keyof LiveCounts) => { if (c[k] !== 0) v.push({ key: k, expected: '0', actual: c[k] }) }
  const eq = (k: keyof LiveCounts, e: number) => { if (c[k] !== e) v.push({ key: k, expected: `정확히 ${e}`, actual: c[k] }) }

  zero('naverOrigin')
  zero('botCommentsOnNaver')
  zero('cafePost')
  zero('cafeTrend')
  zero('commentWaveQueue')
  zero('botLogPurgeTargets')
  zero('r2Remaining')
  eq('tombstoneSignature', exp.tombstonePosts)
  // 보존 수치는 시작과 같아야 한다.
  eq('humanCommentsOnTombstone', exp.humanCommentsOnTombstone)
  eq('nullAuthorCommentsOnTombstone', exp.nullAuthorCommentsOnTombstone)
  eq('guestLikesOnNaver', exp.guestLikesOnNaver)
  eq('reportsOnNaver', exp.reportsOnNaver)
  eq('homeCurationOnNaver', exp.homeCurationOnNaver)
  // 시작값보다 줄면 실패. 늘어난 것은 실행 중 실회원이 쓴 글이다.
  if (c.publicUserPosts < exp.publicUserPosts) v.push({ key: 'publicUserPosts', expected: `${exp.publicUserPosts} 이상`, actual: c.publicUserPosts })
  return v
}

/**
 * 검사 기준선. **코드가 아니라 데이터**다 — 운영은 `EXPECTED` 를, 테스트는 자기 fixture 값을 넣는다.
 * `publicUserPosts` 만 실행 시점의 라이브 값으로 채운다(실회원이 지금도 글을 쓴다).
 */
export type PurgeExpectation = {
  naverOrigin: number; tombstonePosts: number
  humanCommentsOnTombstone: number; nullAuthorCommentsOnTombstone: number
  guestLikesOnNaver: number; reportsOnNaver: number; homeCurationOnNaver: number
  cafePost: number; cafeTrend: number; commentWaveQueue: number
  /** 폐기 대상 BotLog **전체** 잔량 — CAFE_CRAWLER + 원문 조각 파생 로그. CAFE_CRAWLER 만 세면 파생분이 남는다. */
  botLogPurgeTargets: number; r2Objects: number; publicUserPosts: number
}

/** 각 단계가 이미 끝났는지 라이브 카운트로 판정한다 — 저장된 ID 없이 재개할 수 있다. */
export function completedSteps(c: LiveCounts, exp: PurgeExpectation): Set<StepName> {
  const done = new Set<StepName>()
  // 🔴 CAFE_CRAWLER 가 0 이어도 **원문 조각 파생 로그가 남아 있으면 P0 는 끝난 게 아니다.**
  if (c.botLogPurgeTargets === 0) done.add('P0-botlog')
  if (c.r2Remaining === 0) done.add('P1-r2')
  if (c.naverOrigin <= exp.tombstonePosts) done.add('P2-hard-delete')
  if (c.botCommentsOnNaver === 0) done.add('P3-bot-comments')
  if (c.naverOrigin === 0 && c.tombstoneSignature === exp.tombstonePosts) done.add('P4-tombstone')
  if (c.commentWaveQueue === 0) done.add('P5-comment-wave-queue')
  if (c.cafeTrend === 0) done.add('P6-cafe-trend')
  if (c.cafePost === 0) done.add('P7-cafe-post')
  return done
}

/** 로그 마스킹 — 숫자와 화이트리스트 키만 남긴다. */
const LOG_ALLOWED_KEYS = new Set<string>([
  'step', 'table', 'action', 'before', 'after', 'expected', 'affected', 'deleted', 'patched',
  'batches', 'batchSize', 'elapsedMs', 'at', 'dryRun', 'ok', 'key', 'actual', 'skipped', 'resumed',
  ...Object.keys(EXPECTED),
  'naverOrigin', 'naverOriginPublic', 'tombstoneSignature', 'botCommentsOnNaver',
  'humanCommentsOnTombstone', 'nullAuthorCommentsOnTombstone', 'guestLikesOnNaver',
  'reportsOnNaver', 'homeCurationOnNaver', 'cafePost', 'cafeTrend', 'commentWaveQueue',
  'botLogPurgeTargets', 'r2Remaining', 'publicUserPosts',
])

export function redactForLog(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  if (typeof value === 'string') return value.length > 80 ? '[redacted]' : value
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = LOG_ALLOWED_KEYS.has(k) ? redactForLog(v) : '[redacted]'
    }
    return out
  }
  return '[redacted]'
}
