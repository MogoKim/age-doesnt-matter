/**
 * 네이버 카페 유래 데이터 영구 폐기 — **순수 판정 모듈** (I/O 없음).
 *
 * 존재 이유: dry-run 과 실제 실행이 **같은 판정**을 쓰게 만든다.
 * 대상 선정이 두 경로에 따로 있으면 "dry-run 에서 본 것"과 "지운 것"이 달라질 수 있다.
 * 이 파일에는 네트워크·DB 접근이 없다 — 전부 순수 함수라 테스트로 고정할 수 있다.
 *
 * 정책 출처: 창업자 결정(2026-09-10) — 네이버 카페에서 수집·재게시한 원문과 댓글 사본을 영구 폐기.
 * 측정 근거: `docs/operations/2026-09-10-naver-cafe-purge-facts.md`
 */
import { createHash } from 'node:crypto'

/**
 * production Supabase project ref allowlist.
 *
 * ref 자체를 적지 않고 **SHA-256 해시로만** 둔다. 이 저장소는 공개이고, ref 는 현재
 * `origin/main`·`.env.example`·배포된 HTML 어디에도 없다 — 여기에 평문으로 적으면
 * 없던 노출을 새로 만드는 셈이다. 해시 대조로도 allowlist 는 그대로 작동한다.
 */
export const PRODUCTION_PROJECT_REF_SHA256 = '6df9dc71f519af491447c292eac9b9f704534517c5e9fc4b8e0f9cf3e81b85a5'

export function isProductionProjectRef(ref: string): boolean {
  return createHash('sha256').update(ref).digest('hex') === PRODUCTION_PROJECT_REF_SHA256
}

/**
 * "명시적 네이버 유래 Post" 의 단일 정의.
 *
 * `cafePostId` 는 큐레이션 발행이 원문 `CafePost` 를 참조한 흔적이고,
 * `sourceUrl` 의 cafe.naver.com 은 외부 스크랩 경로의 흔적이다. 둘 중 하나면 대상이다.
 * 실측(2026-09-10): cafePostId 6,275 · sourceUrl 1,174 · 합집합 **7,449**.
 *
 * ⚠️ 이 문자열이 대상 정의의 SSoT 다. 바꾸면 회귀 테스트가 깨진다.
 */
export const NAVER_ORIGIN_FILTER = 'or=(cafePostId.not.is.null,sourceUrl.ilike.*cafe.naver.com*)'

/** 봇·페르소나 계정의 providerId 접두어. 실측: bot* 83 · seed* 7 · curator* 223 = 313 / 전체 508. */
export const BOT_PROVIDER_PREFIXES = ['bot', 'seed', 'curator'] as const

export const BOT_AUTHOR_FILTER = `or=(${BOT_PROVIDER_PREFIXES.map((p) => `providerId.ilike.${p}*`).join(',')})`
export const HUMAN_AUTHOR_FILTER = `and=(${BOT_PROVIDER_PREFIXES.map((p) => `providerId.not.ilike.${p}*`).join(',')})`

/**
 * 2026-09-10 production 실측 기준선.
 * 실행 시점 수치가 여기서 벗어나면 **write 전에 중단**한다 — 세상이 바뀐 채로 지우지 않는다.
 */
export const EXPECTED = {
  postTotal: 11_715,
  naverOrigin: 7_449,
  naverOriginPublic: 0,
  tombstonePosts: 226,
  hardDeletePosts: 7_223,
  cafePost: 33_031,
  cafeTrend: 191,
  commentWaveQueue: 276,
  botCommentsOnTombstone: 1_765,
  humanCommentsOnTombstone: 75,
  nullAuthorCommentsOnTombstone: 56,
} as const

/**
 * 허용 범위.
 * - `naverOrigin`·`cafePost`·`cafeTrend`·`commentWaveQueue` 는 **생산자가 전부 제거돼 동결**돼 있다(정확히 일치).
 *   `cto:purge-old-logs` 도 핸들러에서 빠져 CafePost 를 줄이지 않는다.
 * - 실회원 흔적은 **늘어날 수 있다**(사람이 지금도 댓글을 단다). 늘어나는 방향은 안전하므로 하한만 본다 —
 *   TOMBSTONE 이 늘고 HARD DELETE 가 줄어드는 쪽이다.
 * - `postTotal` 은 실회원 글로 증가할 수 있어 ±1%.
 */
export type BaselineActual = {
  postTotal: number
  naverOrigin: number
  naverOriginPublic: number
  tombstonePosts: number
  hardDeletePosts: number
  cafePost: number
  cafeTrend: number
  commentWaveQueue: number
}

export type BaselineViolation = { key: string; expected: string; actual: number }

export function checkBaseline(actual: BaselineActual): BaselineViolation[] {
  const v: BaselineViolation[] = []
  const exact = (k: keyof BaselineActual, e: number) => {
    if (actual[k] !== e) v.push({ key: k, expected: `정확히 ${e}`, actual: actual[k] })
  }
  const within = (k: keyof BaselineActual, e: number, ratio: number) => {
    const lo = Math.floor(e * (1 - ratio))
    const hi = Math.ceil(e * (1 + ratio))
    if (actual[k] < lo || actual[k] > hi) v.push({ key: k, expected: `${lo}~${hi}`, actual: actual[k] })
  }

  exact('naverOrigin', EXPECTED.naverOrigin)
  exact('cafePost', EXPECTED.cafePost)
  exact('cafeTrend', EXPECTED.cafeTrend)
  exact('commentWaveQueue', EXPECTED.commentWaveQueue)
  within('postTotal', EXPECTED.postTotal, 0.01)

  // 공개된 네이버 유래 글이 하나라도 있으면 전제가 무너진 것이다 — 별도 판단 없이 중단한다.
  if (actual.naverOriginPublic !== 0) {
    v.push({ key: 'naverOriginPublic', expected: '정확히 0', actual: actual.naverOriginPublic })
  }
  // 실회원 흔적은 늘어나는 방향만 허용한다.
  if (actual.tombstonePosts < EXPECTED.tombstonePosts) {
    v.push({ key: 'tombstonePosts', expected: `${EXPECTED.tombstonePosts} 이상`, actual: actual.tombstonePosts })
  }
  if (actual.tombstonePosts + actual.hardDeletePosts !== actual.naverOrigin) {
    v.push({ key: 'tombstone+hardDelete', expected: `naverOrigin(${actual.naverOrigin}) 과 동일`, actual: actual.tombstonePosts + actual.hardDeletePosts })
  }
  return v
}

/** Post 한 건의 처분. dry-run 과 execute 가 **이 함수 하나**만 쓴다. */
export type PostDisposition = 'DELETE' | 'TOMBSTONE' | 'PRESERVE'

export type PostForDecision = {
  source: string
  cafePostId: string | null
  sourceUrl: string | null
  /** 실회원 댓글·공감·게스트공감·신고 중 하나라도 붙어 있는가 */
  hasHumanTrace: boolean
}

/** 명시적 네이버 유래인가 — `NAVER_ORIGIN_FILTER` 와 같은 의미를 코드로 다시 쓴 것. */
export function isNaverOrigin(p: Pick<PostForDecision, 'cafePostId' | 'sourceUrl'>): boolean {
  if (p.cafePostId != null) return true
  return (p.sourceUrl ?? '').toLowerCase().includes('cafe.naver.com')
}

export function decidePost(p: PostForDecision): PostDisposition {
  // 🔴 USER 글은 어떤 경우에도 대상이 아니다. 판정의 첫 줄에 둔다.
  if (p.source === 'USER') return 'PRESERVE'
  if (!isNaverOrigin(p)) return 'PRESERVE'
  // 실회원 흔적이 붙어 있으면 hard delete 가 그 흔적까지 cascade 로 지운다 → tombstone 으로 남긴다.
  return p.hasHumanTrace ? 'TOMBSTONE' : 'DELETE'
}

/**
 * tombstone 후 남는 필드.
 * 복원 가능한 콘텐츠(제목·본문·요약·원제목·SEO 문구·slug·출처 URL·썸네일·원문 참조)를 전부 없앤다.
 * `title`·`content` 는 NOT NULL 이라 값을 비울 수 없어 고정 문구로 덮는다 — 원문 흔적이 남지 않는다.
 * `status` 는 건드리지 않는다(전량 HIDDEN/DELETED 라 공개 상태가 바뀌지 않는다).
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
} as const

/** tombstone 후 이 필드들이 남아 있으면 복원이 가능하다 — 검증에 쓴다. */
export const CONTENT_BEARING_FIELDS = Object.keys(TOMBSTONE_PATCH) as (keyof typeof TOMBSTONE_PATCH)[]

export function isTombstoned(row: Record<string, unknown>): boolean {
  for (const f of CONTENT_BEARING_FIELDS) {
    const expected = TOMBSTONE_PATCH[f]
    if (row[f] !== expected) return false
  }
  return true
}

/**
 * 🔴 fail closed — 후보에 USER Post 가 1건이라도 있으면 던진다.
 * 호출부는 이 예외를 잡지 않는다.
 */
export function assertNoUserPosts(rows: { source: string }[]): void {
  const n = rows.filter((r) => r.source === 'USER').length
  if (n > 0) throw new Error(`[FAIL-CLOSED] 후보에 USER Post 가 ${n}건 있다 — 중단한다.`)
}

/**
 * 🔴 무필터 mutation 금지.
 * PostgREST 는 필터 없는 DELETE 를 **테이블 전체 삭제**로 처리한다.
 * 전체 삭제가 의도인 테이블(CafePost 등)은 `allowFullTable` 로 **명시적으로만** 허용한다.
 */
export function assertMutationIsScoped(path: string, opts: { allowFullTable?: boolean } = {}): void {
  const [table, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  const filterKeys = [...params.keys()].filter((k) => !['select', 'limit', 'offset', 'order'].includes(k))
  if (filterKeys.length === 0 && !opts.allowFullTable) {
    throw new Error(`[FAIL-CLOSED] 필터 없는 mutation 요청: ${table} — 중단한다.`)
  }
}

/** 로그에 실릴 수 있는 값에서 본문·제목·닉네임·secret 을 제거한다. 숫자와 화이트리스트 키만 남긴다. */
const LOG_ALLOWED_KEYS = new Set([
  'step', 'table', 'action', 'before', 'after', 'expected', 'deleted', 'patched',
  'batches', 'batchSize', 'elapsedMs', 'at', 'dryRun', 'ok', 'key', 'actual',
  // 집계 건수 키 — 운영자가 기준선을 눈으로 대조해야 한다. 값은 전부 숫자다.
  'postTotal', 'naverOrigin', 'naverOriginPublic', 'tombstonePosts', 'hardDeletePosts',
  'cafePost', 'cafeTrend', 'commentWaveQueue',
  'botCommentsOnTombstone', 'humanCommentsOnTombstone', 'nullAuthorCommentsOnTombstone',
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
