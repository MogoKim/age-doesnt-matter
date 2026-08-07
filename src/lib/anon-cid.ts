/**
 * 비회원 기기 식별자(`anon_cid`) — F19 비회원 세션 계측 기준의 구현체.
 * 기준 문서: `docs/features/F19-anonymous-session-measurement.md`
 *
 * ## 왜 필요한가
 * 첫 방문에서 `page_view`·`post_view`·`post_read`·`post_cta_shown`·`related_recommend_view`가
 * 거의 동시에 `/api/events`로 나간다. `_anon_sid` 쿠키는 그 응답으로만 발급되므로
 * (HTML 응답 Set-Cookie는 Vercel CDN 캐시를 위해 의도적으로 제거됨 — `middleware.ts:234-236`)
 * 5개 요청이 쿠키 왕복 **전에** 출발해 각각 다른 sessionId를 받는다.
 * → 비회원 재방문 52.9% 유실(F19 §3).
 *
 * `anon_cid`는 **클라이언트에서 동기 생성**되므로 첫 이벤트가 나가기 전에 이미 확정돼 있다.
 * 5개 요청이 같은 값을 들고 나가므로 서버가 하나로 묶을 수 있다.
 *
 * ## 성능 상한 (F19 §7 하드 제약 — 넘기면 안 됨)
 * - 추가 네트워크 요청 **0** (서버 왕복 없이 클라에서 생성)
 * - localStorage **read 1회 + (최초 1회) write 1회** — 이후는 모듈 메모 캐시
 * - 외부 라이브러리 **0**, 초기 렌더를 막는 `await`/비동기 초기화 **없음**
 *
 * ## 이 파일이 서버에서도 import 되는 이유
 * 아래 순수 함수(`isValidAnonCid`·`readAnonCidFromProperties`·`resolveGuestKey`·`resolveIdentityKey`)는
 * `/api/events`와 어드민 집계에서도 쓴다. 식별자 규칙이 클라/서버로 갈라지면
 * "무엇으로 세는가"가 다시 흔들리므로 **한 파일에 모아 단일 진실로 둔다.**
 * 브라우저 전용 함수는 `typeof window` 가드로 서버에서 항상 null을 반환한다.
 */

/** localStorage 키. 실험 배정용 `_uid`와 **다른 목적**이므로 절대 섞어 쓰지 않는다. */
export const ANON_CID_KEY = 'unao_anon_cid'

/**
 * 허용 형식 — UUID(36자, 하이픈 포함) 또는 hex/base36 문자열.
 * 서버가 그대로 sessionId(=DB 컬럼)로 쓰므로 길이·문자를 좁게 고정한다.
 * 넓게 열어두면 클라가 보낸 임의 문자열이 식별자 공간을 오염시킨다.
 */
const ANON_CID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** payload/DB에서 읽은 값이 식별자로 쓸 수 있는 형식인지. 서버·클라 공용. */
export function isValidAnonCid(value: unknown): value is string {
  return typeof value === 'string' && ANON_CID_PATTERN.test(value)
}

/** 충돌 확률이 충분히 낮은 새 식별자 생성. crypto 우선, 없으면 단계적 fallback. */
function createAnonCid(): string {
  try {
    const c = globalThis.crypto
    if (typeof c?.randomUUID === 'function') return c.randomUUID()
    if (typeof c?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // crypto 접근 자체가 막힌 환경 → 아래 fallback
  }
  // 최후 fallback: timestamp + 난수 2회. 암호학적 강도는 없지만 식별자 충돌 방지에는 충분하다.
  const rand = () => Math.random().toString(36).slice(2, 12)
  return `${Date.now().toString(36)}-${rand()}${rand()}`
}

/**
 * 모듈 메모 캐시. `trackEvent`는 한 페이지에서 여러 번 호출되므로
 * localStorage read를 매번 하지 않는다(F19 §7 "read 1회").
 * `undefined` = 아직 조회 전, `null` = 조회했으나 사용 불가(스토리지 차단 등).
 */
let cachedCid: string | null | undefined

/** 이미 저장된 값만 조회한다. 없으면 생성하지 않는다. */
export function peekAnonCid(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(ANON_CID_KEY)
    return isValidAnonCid(stored) ? stored : null
  } catch {
    // 시크릿 모드·스토리지 차단 인앱브라우저 등 — 이벤트를 깨뜨리지 않는다
    return null
  }
}

/**
 * 식별자를 조회하고, 없으면 만들어 저장한 뒤 돌려준다. **동기 함수**다.
 *
 * ⚠️ **저장(write)에 실패하면 `null`을 반환한다.** 생성값을 그냥 돌려주면
 * 이벤트마다 서로 다른 anon_cid가 나가서 **지금보다 파편화가 심해진다.**
 * 저장이 안 되는 환경에서는 기존 `_anon_sid` 쿠키 fallback에 맡기는 편이 낫다(F19 §7).
 */
export function getOrCreateAnonCid(): string | null {
  if (typeof window === 'undefined') return null
  if (cachedCid !== undefined) return cachedCid

  // read·write를 한 try로 묶는다. **읽기가 막힌 환경에서 새로 만들면 안 되기 때문**이다 —
  // 읽지 못한 채 만들면 페이지 로드마다 다른 anon_cid가 나가고, 그 값이 쿠키보다 우선하므로
  // 지금보다 파편화가 심해진다. 읽기든 쓰기든 실패하면 `_anon_sid` 쿠키 fallback에 맡긴다.
  try {
    const stored = window.localStorage.getItem(ANON_CID_KEY)
    if (isValidAnonCid(stored)) {
      cachedCid = stored
      return cachedCid
    }
    const created = createAnonCid()
    window.localStorage.setItem(ANON_CID_KEY, created)
    cachedCid = created
    return cachedCid
  } catch {
    cachedCid = null
    return cachedCid
  }
}

/** 테스트 전용 — 모듈 메모 캐시 초기화. 프로덕션 코드에서 호출하지 말 것. */
export function __resetAnonCidCacheForTest(): void {
  cachedCid = undefined
}

// ─────────────────────────────────────────────────────────────
// 서버·집계 공용 순수 함수 (브라우저 API 미사용)
// ─────────────────────────────────────────────────────────────

/** EventLog.properties(JSON)에서 유효한 anon_cid만 꺼낸다. */
export function readAnonCidFromProperties(properties: unknown): string | null {
  if (typeof properties !== 'object' || properties === null) return null
  const value = (properties as Record<string, unknown>).anon_cid
  return isValidAnonCid(value) ? value : null
}

export interface EventIdentityRow {
  sessionId?: string | null
  properties?: unknown
}

/**
 * **비회원 식별자** — F19 §4 우선순위: `anon_cid` → `sessionId`.
 *
 * 참고: 이 PR 이후 서버가 `sessionId = anon_cid`로 적재하므로 신규 행은 두 값이 같다.
 * 이 함수가 실제로 값을 바꾸는 것은 ① anon_cid를 못 보낸 경로 ② 과거 행 뿐이며,
 * 그 경우 안전하게 기존 `sessionId`로 떨어진다(과거 데이터 호환).
 */
export function resolveGuestKey(row: EventIdentityRow): string | null {
  return readAnonCidFromProperties(row.properties) ?? row.sessionId ?? null
}

/**
 * **전체 식별자** — F19 §4 우선순위: `userId` → `anon_cid` → `sessionId`.
 * 회원은 언제나 `userId`가 정본이다(기기·세션이 갈려도 한 사람).
 */
export function resolveIdentityKey(
  row: EventIdentityRow & { userId?: string | null },
): string | null {
  return row.userId ?? resolveGuestKey(row)
}

/**
 * `/api/events`가 EventLog에 적재할 sessionId를 결정한다 (F19 §7).
 *
 * 우선순위: **클라 `anon_cid` → 기존 `_anon_sid` 쿠키 → 신규 발급**.
 * 결정된 값은 호출부에서 `_anon_sid` 쿠키로도 내려가므로,
 * **localStorage와 쿠키가 같은 값으로 수렴**한다(둘 중 하나가 지워져도 식별자 유지).
 *
 * 봇은 기존 정책 그대로 `null` — 봇 트래픽에 식별자를 주지 않는다.
 */
export function resolveEventSessionId(input: {
  isBot: boolean
  properties?: unknown
  existingSid?: string | null
  createFallbackId: () => string
}): string | null {
  if (input.isBot) return null
  return (
    readAnonCidFromProperties(input.properties) ??
    input.existingSid ??
    input.createFallbackId()
  )
}
