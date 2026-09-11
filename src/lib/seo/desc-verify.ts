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

export interface VerifyCounts {
  total: number
  match: number
  mismatched: number
  failed: number
  banned: number
}

export type VerifyOutcome =
  /** 전건 일치 — 끝 */
  | 'OK'
  /** HTML 이 아직 옛 문구다. **DB 문제가 아니다** — 캐시가 안 내려갔을 뿐 */
  | 'CACHE_PENDING'
  /** 요청 자체가 실패했다 — 네트워크·배포 문제 */
  | 'FETCH_FAILED'
  /** 승인되지 않은 금지 표현이 공개 면에 있다 — 내용 문제 */
  | 'CONTENT_VIOLATION'

export interface VerifyVerdict {
  outcome: VerifyOutcome
  /** DB 롤백을 권고하는가 — 캐시 지연은 **롤백 사유가 아니다** */
  shouldRollback: boolean
  hint: string
}

/**
 * HTML 검증 결과를 판정한다.
 *
 * 핵심은 **HTML 불일치와 DB 오류를 섞지 않는 것**이다.
 * `/jobs/[id]` 는 라우트 ISR 로 캐시되므로, DB 가 올바르게 바뀐 뒤에도
 * 한동안 옛 HTML 이 나온다. 그걸 보고 롤백하면 멀쩡한 정정을 되돌리게 된다.
 *
 * DB 가 맞는지는 적용 CLI 의 사후 검증([6]단계)이 이미 확인했다.
 * 여기서 보는 것은 **공개 면에 반영됐는가** 하나뿐이다.
 */
export function classifyVerifyOutcome(c: VerifyCounts): VerifyVerdict {
  if (c.banned > 0) {
    return {
      outcome: 'CONTENT_VIOLATION',
      shouldRollback: true,
      hint: `공개 면에 미승인 금지 표현이 ${c.banned}건 있다. 제안 문구를 다시 검토해야 한다.`,
    }
  }
  if (c.failed > 0) {
    return {
      outcome: 'FETCH_FAILED',
      shouldRollback: false,
      hint: `요청 ${c.failed}건이 실패했다. 배포·네트워크 상태를 먼저 확인해라. DB 문제가 아니다.`,
    }
  }
  if (c.mismatched > 0) {
    return {
      outcome: 'CACHE_PENDING',
      shouldRollback: false,
      hint:
        `${c.mismatched}건이 아직 옛 문구다. **라우트 ISR 캐시가 내려가지 않은 것이고 DB 문제가 아니다.** ` +
        `ISR 은 만료 후 첫 요청에 stale 을 주고 뒤에서 다시 만든다 — 같은 URL 을 한 번 더 요청해야 새 값이 나온다. ` +
        `롤백하지 말고 기다렸다가 재확인해라.`,
    }
  }
  return { outcome: 'OK', shouldRollback: false, hint: '' }
}
