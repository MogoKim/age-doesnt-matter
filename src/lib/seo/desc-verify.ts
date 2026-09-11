/**
 * production meta description 검증 — **순수 로직**.
 *
 * HTTP 호출과 CLI 진입점은 `scripts/seo-desc-verify-production.ts` 에 있고,
 * 여기에는 파싱·판정만 둔다. 실행부와 판정부를 한 파일에 두면 테스트가 그 파일을
 * import 하는 순간 진짜 요청이 나간다 — 실제로 한 번 그렇게 됐다.
 */

/** 금지 표현 4종(브랜드 규칙) */
export const BANNED_TERMS = ['시니어', '어르신', '노인', '실버'] as const

/**
 * 원문 공고 제목의 공식 직함이라 **보존이 승인된** 토큰.
 * 문서 §2 `OFFICIAL_JOB_TITLE`. 이건 잔존해도 결함이 아니다.
 */
export const APPROVED_TOKENS = ['노인돌봄', '노인주간보호센터', '노인요양원'] as const

/** `<meta name="description" content="...">` 를 속성 순서·따옴표 종류에 관계없이 뽑는다. */
export function extractMetaDescription(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    if (!/name\s*=\s*["']description["']/i.test(tag)) continue
    const m = tag.match(/content\s*=\s*"([^"]*)"/i) ?? tag.match(/content\s*=\s*'([^']*)'/i)
    if (m) return decodeEntities(m[1])
  }
  return null
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')   // 마지막 — 이중 디코딩 방지
}

/**
 * **승인되지 않은** 금지 표현만 걸러낸다.
 *
 * 승인 토큰을 먼저 가린 뒤에 찾는다. 그냥 `includes` 로 세면
 * `노인요양원`(공식 직함) 때문에 `노인` 이 잡혀 거짓 경보가 난다.
 */
export function unapprovedBanned(text: string): string[] {
  let masked = text
  for (const t of APPROVED_TOKENS) masked = masked.split(t).join('·')
  return BANNED_TERMS.filter((w) => masked.includes(w))
}

// ── 검증 결과 판정 ───────────────────────────────────────────

/**
 * 한 URL 의 관측 상태.
 *
 * `MATCHED` 와 `VIOLATION` 은 **terminal** 이다 — 한 번 그렇게 판정되면 다시 조회하지
 * 않고, 뒤 라운드가 덮어쓰지도 못한다. 라운드마다 위반을 초기화하면 앞 라운드에서
 * 발견한 진짜 위반이 조용히 사라진다.
 */
export type UrlState =
  /** 이 모드의 기대값과 정확히 같다 */
  | 'MATCHED'
  /** 아직 반대쪽 값이다 — 캐시가 안 내려갔다. **DB 문제가 아니다** */
  | 'PENDING'
  /** current 도 proposed 도 아니다 — 그 사이 누가 다른 값을 썼다 */
  | 'UNEXPECTED'
  /** 요청 자체가 실패했다 */
  | 'FETCH_FAILED'
  /** 기대값과 일치하는데 그 안에 미승인 금지 표현이 있다 — 진짜 내용 문제 */
  | 'VIOLATION'

export interface UrlObservation {
  id: string
  state: UrlState
  /** `VIOLATION` 일 때만 채워진다 */
  banned: string[]
}

export interface ObserveInput {
  id: string
  mode: 'after' | 'before'
  currentValue: string | null
  proposedValue: string | null
  /** 파싱된 meta description. `null` 이면 요청 실패 */
  html: string | null
  status: number
}

/**
 * 한 URL 을 판정한다.
 *
 * 핵심 규칙: **내용 검사는 기대값과 정확히 일치할 때만 한다.**
 *
 * 확정 CSV 실측으로 적용 대상 50건 중 **48건의 `currentSeoDescription` 에
 * 미승인 금지 표현이 있다.** 적용 직후 캐시가 안 내려간 상태에서 HTML 을 읽으면
 * 그 48건에서 금지어가 그대로 나온다 — 그것은 **정상적인 중간 상태**다.
 * 여기서 위반으로 판정하면 멀쩡한 정정을 롤백하게 된다.
 *
 * 롤백 검증(`--expect=before`)도 마찬가지다. 옛 문구로 정확히 복원된 것이
 * 목표이므로, 그 안의 금지 표현을 다시 위반으로 세지 않는다.
 */
export function observeUrl(input: ObserveInput): UrlObservation {
  const { id, mode, currentValue, proposedValue, html, status } = input
  if (html === null || status !== 200) return { id, state: 'FETCH_FAILED', banned: [] }

  const want = mode === 'after' ? proposedValue : currentValue
  const other = mode === 'after' ? currentValue : proposedValue

  if (html !== want) {
    // 반대쪽 값이면 캐시가 안 내려간 것이고, 둘 다 아니면 누가 다른 값을 쓴 것이다.
    // 어느 쪽이든 **내용 검사를 하지 않는다** — 기대값이 아닌 문자열이기 때문이다.
    return { id, state: html === other ? 'PENDING' : 'UNEXPECTED', banned: [] }
  }

  // 여기부터는 기대값과 정확히 같다.
  if (mode === 'before') {
    // 롤백 완료. 옛 문구의 금지 표현은 되돌리기로 한 그 상태다 — 위반이 아니다.
    return { id, state: 'MATCHED', banned: [] }
  }

  // `after` 이고 제안값과 정확히 같다 → 이때만 내용을 본다.
  // 확정 CSV 의 proposed 는 전건 깨끗하므로(0/50) 여기서 걸리면 CSV 가 오염된 것이다.
  const banned = unapprovedBanned(html)
  return banned.length ? { id, state: 'VIOLATION', banned } : { id, state: 'MATCHED', banned: [] }
}

export interface VerifyCounts {
  total: number
  matched: number
  pending: number
  unexpected: number
  fetchFailed: number
  violation: number
}

export function aggregate(obs: UrlObservation[]): VerifyCounts {
  const c: VerifyCounts = {
    total: obs.length, matched: 0, pending: 0, unexpected: 0, fetchFailed: 0, violation: 0,
  }
  for (const o of obs) {
    if (o.state === 'MATCHED') c.matched++
    else if (o.state === 'PENDING') c.pending++
    else if (o.state === 'UNEXPECTED') c.unexpected++
    else if (o.state === 'FETCH_FAILED') c.fetchFailed++
    else c.violation++
  }
  return c
}

export type VerifyOutcome = 'OK' | 'CACHE_PENDING' | 'FETCH_FAILED' | 'CONTENT_VIOLATION'

export interface VerifyVerdict {
  outcome: VerifyOutcome
  /** DB 롤백을 권고하는가 — **캐시 지연은 롤백 사유가 아니다** */
  shouldRollback: boolean
  hint: string
}

/**
 * 전체 판정.
 *
 * 우선순위: 진짜 내용 위반 > 요청 실패 > 아직 반영 안 됨 > OK.
 * `CONTENT_VIOLATION` 만 롤백을 권고한다.
 */
export function classifyVerifyOutcome(c: VerifyCounts, mode: 'after' | 'before' = 'after'): VerifyVerdict {
  if (c.violation > 0) {
    return {
      outcome: 'CONTENT_VIOLATION',
      shouldRollback: true,
      hint:
        `${c.violation}건이 **기대값과 정확히 일치하는데** 그 안에 미승인 금지 표현이 있다. ` +
        `캐시 지연이 아니라 제안 문구 자체의 문제다 — 확정 CSV 를 다시 검토해야 한다.`,
    }
  }
  if (c.fetchFailed > 0) {
    return {
      outcome: 'FETCH_FAILED',
      shouldRollback: false,
      hint: `요청 ${c.fetchFailed}건이 실패했다. 배포·네트워크 상태를 먼저 확인해라. DB 문제가 아니다.`,
    }
  }
  if (c.pending > 0 || c.unexpected > 0) {
    const parts: string[] = []
    if (c.pending > 0) {
      parts.push(
        mode === 'after'
          ? `${c.pending}건이 아직 옛 문구다 — **라우트 ISR 캐시가 안 내려간 것이고 DB 문제가 아니다.** ` +
            `ISR 은 만료 후 첫 요청에 stale 을 주고 뒤에서 다시 만든다(같은 URL 을 한 번 더 쳐야 새 값이 나온다). ` +
            `옛 문구에 금지 표현이 있는 것은 정상이다 — 그래서 위반으로 세지 않았다.`
          : `${c.pending}건이 아직 새 문구다 — 롤백이 공개 면에 반영되지 않았다. 캐시가 내려가길 기다려라.`,
      )
    }
    if (c.unexpected > 0) {
      parts.push(
        `${c.unexpected}건은 current 도 proposed 도 아닌 값이다 — ` +
        `그 사이 누가 다른 값을 썼을 수 있다. 캐시 지연과 구분해서 확인해라.`,
      )
    }
    parts.push('롤백하지 말고 기다렸다 재확인해라.')
    return { outcome: 'CACHE_PENDING', shouldRollback: false, hint: parts.join(' ') }
  }
  return { outcome: 'OK', shouldRollback: false, hint: '' }
}

/**
 * URL 별 **terminal 상태**를 들고 라운드를 넘긴다.
 *
 * 라운드마다 카운터를 초기화하면, 앞 라운드에서 발견한 진짜 위반이 뒤 라운드에서
 * 사라진다. 그래서 상태를 URL 단위로 유지하고, terminal(`MATCHED`·`VIOLATION`)에
 * 도달한 URL 은 다시 조회하지도, 덮어쓰지도 않는다.
 */
export interface Tracker {
  /** 이번 라운드 관측을 반영한다 */
  record(obs: UrlObservation[]): void
  /** 아직 terminal 이 아닌 URL — 다음 라운드에 다시 친다 */
  pending(): string[]
  snapshot(): VerifyCounts
  /** 위반으로 확정된 URL 들 */
  violations(): UrlObservation[]
}

const TERMINAL: ReadonlySet<UrlState> = new Set<UrlState>(['MATCHED', 'VIOLATION'])

export function createTracker(ids: string[]): Tracker {
  const state = new Map<string, UrlObservation>(
    ids.map((id) => [id, { id, state: 'PENDING' as UrlState, banned: [] }]),
  )
  return {
    record(obs) {
      for (const o of obs) {
        const prev = state.get(o.id)
        // terminal 은 덮지 않는다 — 특히 VIOLATION 이 조용히 사라지면 안 된다
        if (prev && TERMINAL.has(prev.state)) continue
        state.set(o.id, o)
      }
    },
    pending() {
      return [...state.values()].filter((o) => !TERMINAL.has(o.state)).map((o) => o.id)
    },
    snapshot() {
      return aggregate([...state.values()])
    },
    violations() {
      return [...state.values()].filter((o) => o.state === 'VIOLATION')
    },
  }
}
