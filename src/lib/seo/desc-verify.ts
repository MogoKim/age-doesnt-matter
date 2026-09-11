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
