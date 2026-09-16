/**
 * JobPosting 구조화 데이터 빌더 (순수 — DB·React 의존 없음)
 *
 * ── 왜 만들었나 (2026-09-16 production 50건 전수 실측) ─────────
 *  기존 인라인 구현이 **사실과 다른 값을 Google 에 선언**하고 있었다:
 *    · `employmentType: 'FULL_TIME'` 50/50 하드코딩 — 표시 급여 24건이 시급직이다
 *    · `directApply: true` 50/50 — 전부 외부 `work24.go.kr` 로 나가고
 *      본문 전화번호 0건 · 이메일 0건 · 사이트 내 지원 폼 0건
 *    · `baseSalary` 26/50 — 빠진 24건은 전부 `시급 …`. 파서가 `월 N만원` 만 봤다
 *
 * ── Google 공식 기준 (search/docs/appearance/structured-data/job-posting)
 *  · `employmentType` 은 **권장**이고 허용값이 정해져 있다(아래 상수).
 *    🔴 모르면 **넣지 않는다.** 틀린 값보다 없는 게 낫다.
 *  · `baseSalary.value.unitText` 는 HOUR·DAY·WEEK·MONTH·YEAR 만 허용한다.
 *  · `directApply` 는 "이 공고 URL 이 **직접 지원**을 가능하게 하는가"다. 셋 중 하나면 참:
 *      ① 사이트 안에서 지원 완료(다중 로그인 없이)
 *      ② 공고에 **직접 연락처(이메일·전화)** 포함
 *      ③ 면접 일정 예약 가능
 *    🔴 "외부 링크"라는 사실 하나로 단정하지 않는다 — ②까지 본 뒤에 판정한다.
 *  · `validThrough` 는 "만료가 없거나 **모르면 아예 생략**"이 공식 지침이다.
 *    🔴 `JobDetail.expiresAt` 에 쓰는 코드가 어디에도 없어 항상 NULL 이다.
 *       지금의 생략은 결함이 아니라 **정답**이다. 날짜를 지어내지 않는다.
 *
 * ── 🔴 급여는 "화면에 보이는 문자열"을 판다 ────────────────────
 *  구조화 데이터는 **사용자에게 보이는 값과 일치**해야 한다(Google 정책).
 *  그래서 원본 `salary` 가 아니라 `formatSalary()` 가 정규화한 **표시 문자열**을 파싱한다.
 *  두 곳이 갈리면 "보이는 것과 다른 구조화 데이터"가 되어 위반이다.
 */

/** Google 이 허용하는 employmentType 값 (대소문자 구분) */
export const EMPLOYMENT_TYPE_VALUES = [
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY',
  'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
] as const

/** Google 이 허용하는 baseSalary 단위 */
const UNIT_MONTH = 'MONTH'
const UNIT_HOUR = 'HOUR'

export interface MonetaryAmount {
  '@type': 'MonetaryAmount'
  currency: 'KRW'
  value: {
    '@type': 'QuantitativeValue'
    minValue: number
    maxValue: number
    unitText: typeof UNIT_MONTH | typeof UNIT_HOUR
  }
}

const money = (minValue: number, maxValue: number, unitText: MonetaryAmount['value']['unitText']): MonetaryAmount => ({
  '@type': 'MonetaryAmount',
  currency: 'KRW',
  // 원본이 뒤집혀 들어와도 min ≤ max 를 지킨다 — 구조화 데이터 검증에서 오류가 된다
  value: {
    '@type': 'QuantitativeValue',
    minValue: Math.min(minValue, maxValue),
    maxValue: Math.max(minValue, maxValue),
    unitText,
  },
})

/**
 * 표시 급여 문자열 → `baseSalary`.
 *
 * `formatSalary()` 가 만드는 형태만 다룬다(실측 50건 기준):
 *   · `월 227만원` · `월 216~240만원`
 *   · `시급 1만원` · `시급 1.3만원`  ← 기존 파서가 통째로 놓치던 구간
 *   · `급여 협의` · 그 외 자유 문자열 → **null** (지어내지 않는다)
 */
export function parseBaseSalary(display: string | null | undefined): MonetaryAmount | null {
  if (!display) return null
  const s = display.replace(/,/g, '').replace(/\s+/g, ' ').trim()
  if (s === '' || s.includes('협의')) return null

  // "월 216~240만원" / "월 227만원"  (만원 단위)
  const m = s.match(/^월\s*([\d.]+)(?:\s*[~\-]\s*([\d.]+))?\s*만원?$/)
  if (m) {
    const low = Number(m[1]) * 10000
    const high = m[2] ? Number(m[2]) * 10000 : low
    if (Number.isFinite(low) && Number.isFinite(high)) return money(low, high, UNIT_MONTH)
    return null
  }

  // "시급 1만원" / "시급 1.3만원"  (만원 단위 — 1.3만원 = 13,000원)
  const hMan = s.match(/^시급\s*([\d.]+)(?:\s*[~\-]\s*([\d.]+))?\s*만원?$/)
  if (hMan) {
    const low = Number(hMan[1]) * 10000
    const high = hMan[2] ? Number(hMan[2]) * 10000 : low
    if (Number.isFinite(low) && Number.isFinite(high)) return money(low, high, UNIT_HOUR)
    return null
  }

  // "시급 10030원" (원 단위 — formatSalary 의 다른 분기)
  const hWon = s.match(/^시급\s*(\d+)(?:\s*[~\-]\s*(\d+))?\s*원$/)
  if (hWon) {
    const low = Number(hWon[1])
    const high = hWon[2] ? Number(hWon[2]) : low
    if (Number.isFinite(low) && Number.isFinite(high)) return money(low, high, UNIT_HOUR)
    return null
  }

  // 해석 못 한 형태는 만들지 않는다
  return null
}

/**
 * `JobDetail.jobType`(스크래퍼가 work24 의 "고용형태/근무형태" 라벨에서 긁은 **자유 한국어**)
 * → Google enum.
 *
 * 🔴 **확실한 표현만** 매핑한다. "기간의 정함이 없는 근로계약" 처럼 해석이 갈리는 문구는
 *    `null` 로 두어 `employmentType` 자체를 생략한다 — 틀린 값보다 없는 게 낫다.
 */
const EMPLOYMENT_TYPE_MAP: ReadonlyArray<readonly [RegExp, (typeof EMPLOYMENT_TYPE_VALUES)[number]]> = [
  [/파트\s*타임|시간\s*제|단시간/, 'PART_TIME'],
  [/일용직|일용\s*근로/, 'PER_DIEM'],
  [/인턴|수습생/, 'INTERN'],
  [/자원\s*봉사|봉사직/, 'VOLUNTEER'],
  [/계약직|기간제/, 'CONTRACTOR'],
  [/임시직|단기\s*계약/, 'TEMPORARY'],
  [/정규직|상용직/, 'FULL_TIME'],
]

export function mapEmploymentType(jobType: string | null | undefined): string[] | null {
  if (!jobType) return null
  const s = jobType.replace(/\s+/g, ' ').trim()
  if (s === '') return null
  for (const [re, value] of EMPLOYMENT_TYPE_MAP) {
    if (re.test(s)) return [value]
  }
  return null
}

/** 본문에 사람이 바로 연락할 수 있는 수단이 있는가 (Google 조건 ②) */
const PHONE_RE = /(?:^|[^\d])(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?![\d])/
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/

/**
 * `directApply` 판정.
 *
 * 🔴 외부 링크라는 사실 **하나만으로 false 로 단정하지 않는다.**
 *    Google 조건은 OR 이므로, 외부로 나가더라도 본문에 직접 연락처가 있으면 true 다.
 *
 * 반환값:
 *   · `true`      — 자사 도메인에서 지원이 끝나거나, 본문에 직접 연락처가 있다
 *   · `false`     — 외부로 나가고 직접 연락처도 없다 (확인된 부정)
 *   · `undefined` — 지원 URL 자체가 없다. **판단하지 않는다**(키를 생략한다)
 */
export function resolveDirectApply(input: {
  applyUrl: string | null | undefined
  plainContent: string
  siteOrigin: string
}): boolean | undefined {
  if (!input.applyUrl) return undefined

  let sameSite = false
  try {
    sameSite = new URL(input.applyUrl, input.siteOrigin).origin === new URL(input.siteOrigin).origin
  } catch {
    // 파싱 불가한 URL 은 외부로 본다
  }
  if (sameSite) return true

  const body = input.plainContent ?? ''
  if (PHONE_RE.test(body) || EMAIL_RE.test(body)) return true
  return false
}

export interface JobPostingInput {
  id: string
  title: string
  /** HTML 제거한 본문 평문 */
  plainContent: string
  company: string
  region: string
  location: string
  /** `formatSalary()` 가 만든 **표시** 문자열 */
  salaryDisplay: string
  /** ISO 8601 */
  createdAt: string
  applyUrl: string | null
  /** `JobDetail.jobType` — 자유 한국어. 없으면 null */
  jobType: string | null
  /** `JobDetail.expiresAt` — ISO 8601. 없으면 null (지금은 항상 null) */
  expiresAt: string | null
  siteOrigin: string
}

/** 설명문 상한 — 기존 동작 유지 */
const DESCRIPTION_MAX = 500

export function buildJobPostingJsonLd(i: JobPostingInput): Record<string, unknown> {
  const baseSalary = parseBaseSalary(i.salaryDisplay)
  const employmentType = mapEmploymentType(i.jobType)
  const directApply = resolveDirectApply({
    applyUrl: i.applyUrl,
    plainContent: i.plainContent,
    siteOrigin: i.siteOrigin,
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: i.title,
    description: i.plainContent.slice(0, DESCRIPTION_MAX),
    datePosted: i.createdAt,
    hiringOrganization: {
      '@type': 'Organization',
      name: i.company || '채용기업',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: i.region,
        addressRegion: i.region,
        addressCountry: 'KR',
        streetAddress: i.location,
      },
    },
    // 아래 넷은 **값을 확인했을 때만** 넣는다. 키가 남지 않게 spread 로 붙인다.
    ...(baseSalary ? { baseSalary } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(directApply === undefined ? {} : { directApply }),
    ...(i.expiresAt ? { validThrough: i.expiresAt } : {}),
  }
}
