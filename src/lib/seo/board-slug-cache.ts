/**
 * slug → 정본 BoardType 캐시 (Edge·Node 공용).
 *
 * ── 왜 캐시가 필요한가 ────────────────────────────────────────
 *  크로스보드 URL(`/community/humor/<stories-slug>`)을 308 로 교정하려면 middleware 가
 *  "이 글이 어느 보드에 있는가"를 알아야 한다. 매 요청마다 Supabase REST 를 치면
 *  커뮤니티 상세라는 **가장 뜨거운 경로**에 왕복이 하나 붙는다.
 *
 * ── 🔴 왜 캐시를 "리다이렉트 판정"에 직접 쓰면 안 되는가 ──────
 *  글은 이동한다(`adminMovePost`: STORY → MENOPAUSE 등). 이동 직후 캐시가 옛 보드를
 *  들고 있으면, **새 정본 URL 을 옛 주소로 308** 하는 최악의 결과가 나온다:
 *
 *      캐시: <slug> → STORY   (이동 전 값)
 *      실제: <slug> 는 이제 MENOPAUSE
 *      요청: /community/menopause/<slug>        ← 정본 URL
 *      결과: 308 → /community/stories/<slug>    ← 🔴 정본을 옛 주소로 밀어낸다
 *
 *  그래서 이 모듈은 **캐시를 "교정 불필요" 판정에만** 쓰게 설계한다.
 *  실제 308 은 언제나 `fetchBoardType()` 의 갓 읽은 값으로만 낸다(호출부 계약).
 *  그러면 stale 캐시가 만들 수 있는 최악은 **교정 누락**이고, 그때도 페이지는
 *  DB 를 새로 읽어 정본 canonical 을 달기 때문에 중복 신호가 남지 않는다.
 *
 *  여기에 더해 `adminMovePost` 가 이동 직후 이 캐시를 **명시적으로 무효화**한다.
 *  무효화가 실패해도(Redis 장애) 위 설계 덕분에 잘못된 308 은 나오지 않는다 — 2중 방어다.
 */
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const BOARD_CACHE_PREFIX = 'board:'
/**
 * 찾은 보드. 1시간.
 *
 * 글의 보드는 거의 안 바뀌고, 바뀌면 `adminMovePost` 가 **즉시 지운다**. 그럼에도
 * 24시간이 아니라 1시간인 이유: 무효화가 실패할 수 있기 때문이다(Redis 장애).
 * 그때 옛 URL 이 새 정본으로 수렴하기까지 걸리는 시간의 **상한**이 이 값이다.
 * (정본 URL 로 누가 한 번만 들어와도 그 즉시 캐시가 고쳐져 더 빨리 수렴한다.)
 */
export const BOARD_CACHE_TTL_S = 3600
/** "그런 slug 없음" — 방금 발행된 글이 하루 동안 '없는 글'로 굳지 않게 짧게만 기억한다 */
export const BOARD_CACHE_NEGATIVE_TTL_S = 300

const key = (slug: string) => `${BOARD_CACHE_PREFIX}${slug}`

/** "없는 글" 을 기록하는 sentinel. Redis 에 빈 문자열로 들어간다. */
const ABSENT_SENTINEL = ''

/**
 * 캐시 조회 결과. **세 상태를 구분한다.**
 *
 * 🔴 왜 tri-state 인가: 이전 구현은 `string | null` 이라 "캐시 없음"과 "없는 글로 캐시됨"이
 *    똑같이 `null` 이었다. 그래서 **negative 캐시가 실질적으로 죽어 있었다** — 존재하지 않는
 *    slug 로 들어오는 요청마다 Supabase REST 를 다시 쳤다(봇이 만들어내는 쓰레기 URL 이
 *    그대로 REST 부하가 된다). 상태를 나눠야 "없는 걸 안다"를 쓸 수 있다.
 */
export type CachedBoardLookup =
  /** 캐시에 없다 — 또는 Redis 장애(구분하지 않는다. 둘 다 "새로 읽어라"다) */
  | { kind: 'miss' }
  /** "그런 slug 없음" 이 캐시돼 있다 — REST 를 다시 칠 필요가 없다 */
  | { kind: 'absent' }
  /** 캐시된 보드 타입 */
  | { kind: 'found'; boardType: string }

/**
 * 캐시를 읽는다.
 *
 * 🔴 `found.boardType` 으로 **redirect 를 결정하지 마라.** "URL 보드와 같으니 교정이
 *    필요 없다"를 판단하는 데만 써라(호출부 주석 참조).
 */
export async function readCachedBoardType(slug: string): Promise<CachedBoardLookup> {
  try {
    const cached = await redis.get<string>(key(slug))
    if (cached === null || cached === undefined) return { kind: 'miss' }
    if (cached === ABSENT_SENTINEL) return { kind: 'absent' }
    return { kind: 'found', boardType: cached }
  } catch {
    // Redis 장애는 miss 와 같이 다룬다 — 권위 있는 소스를 새로 읽으면 된다(fail-open)
    return { kind: 'miss' }
  }
}

/** 갓 읽은 값을 기록한다. `null`(없는 글)은 sentinel + 짧은 TTL 로만. */
export async function writeCachedBoardType(slug: string, boardType: string | null): Promise<void> {
  try {
    await redis.set(key(slug), boardType ?? ABSENT_SENTINEL, {
      ex: boardType ? BOARD_CACHE_TTL_S : BOARD_CACHE_NEGATIVE_TTL_S,
    })
  } catch {
    // 캐시는 최적화일 뿐이다 — 실패해도 정확성에 영향이 없어야 한다(위 설계)
  }
}

/**
 * 글이 다른 보드로 이동했을 때 캐시를 버린다. `adminMovePost` 가 호출한다.
 * 실패해도 던지지 않는다 — 이동 자체를 실패시키면 안 되고, 잘못된 308 은
 * 호출부 설계가 이미 막고 있다.
 */
export async function invalidateCachedBoardType(slug: string | null | undefined): Promise<void> {
  if (!slug) return
  try {
    await redis.del(key(slug))
  } catch {
    // 위 주석 참조 — 무효화 실패는 "교정이 늦어질 수 있다"일 뿐이다
  }
}
