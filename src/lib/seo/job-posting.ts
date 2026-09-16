/**
 * JobPosting 구조화 데이터 빌더 (순수 — DB·React 의존 없음)
 *
 * ── 이 파일의 원칙 하나 ───────────────────────────────────────
 *  **근거가 없으면 값을 만들지 않는다.** Google 의 JobPosting 에서 Required 는
 *  title·description·datePosted·hiringOrganization·jobLocation 뿐이고,
 *  나머지는 전부 **권장**이다. 권장 필드를 추정으로 채우면 "틀린 사실"을 선언하게 된다.
 *  필드를 채운 건수는 목표가 아니다 — **사실에 맞는 것**이 목표다.
 *
 * ── 1차 구현이 틀렸던 세 곳 (재리뷰 보정) ─────────────────────
 *  ① directApply 를 "자사 도메인" 또는 "본문에 전화/이메일" 로 판정했다.
 *     둘 다 **지원이 실제로 그 경로로 완료된다는 증거가 아니다.**
 *  ② employmentType 을 정규직→FULL_TIME, 계약직→CONTRACTOR 로 매핑했다.
 *     **범주가 다르다**(고용 기간 vs 근로시간 / 기간제 근로자 vs 도급).
 *  ③ baseSalary 를 "화면 문자열을 파싱하니 정확하다"고 봤는데,
 *     **원본→화면 단계에서 이미 손실**이 있었다(범위 소실·반올림·단위 추정).
 */

/** Google 이 허용하는 employmentType 값 (대소문자 구분) */
export const EMPLOYMENT_TYPE_VALUES = [
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY',
  'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
] as const

export interface MonetaryAmount {
  '@type': 'MonetaryAmount'
  currency: 'KRW'
  value: {
    '@type': 'QuantitativeValue'
    minValue: number
    maxValue: number
    unitText: 'MONTH' | 'HOUR'
  }
}

/* ────────────────────────────────────────────────────────────
 * ① directApply
 * ──────────────────────────────────────────────────────────── */

/**
 * Google 정의: "이 공고 URL 이 **직접 지원**을 가능하게 하는가."
 * 참이 되는 조건(OR):
 *   ① 사이트 안에서 지원이 완료된다(다중 로그인 없이)
 *   ② 공고에 **채용 회사(또는 대리인)의 지원 연락처**가 있다
 *   ③ 면접 일정 예약이 가능하다
 *
 * 🔴 우리가 **확인할 수 없는 것들**:
 *   · 자사 도메인 URL 이라는 사실은 ①의 증거가 아니다.
 *     실제로 사이트 안에 지원 라우트가 없다(`app/(main)/jobs/` = `[id]` · `region` 뿐).
 *   · 본문의 전화번호·이메일이 **그 채용의 지원 창구**라는 보장이 없다.
 *     기관 대표번호·원문 출처 안내·무관한 숫자열일 수 있고, 우리는 구분할 수단이 없다.
 *   · 외부 포털(work24)로 나간다는 사실도 **false 의 증거가 아니다** — 그 포털에서
 *     지원이 끝날 수도 있다. "다중 로그인 없이"인지 확인할 수단이 없다.
 *
 * → 따라서 현재 데이터로는 **참도 거짓도 세울 수 없다. 생략한다.**
 *
 * 되살리는 조건(둘 중 하나가 생기면 이 함수부터 고친다):
 *   · 자사에 실제 지원 라우트가 생기고, 그 경로로 지원이 완료됨을 코드로 보장할 수 있을 때
 *   · 수집 단계에서 **채용 담당자 연락처**를 별도 필드로 확보할 때(본문 정규식이 아니라)
 */
export function resolveDirectApply(_input: {
  applyUrl: string | null | undefined
  plainContent: string
  siteOrigin: string
}): boolean | undefined {
  return undefined
}

/* ────────────────────────────────────────────────────────────
 * ② employmentType
 * ──────────────────────────────────────────────────────────── */

/**
 * 🔴 **범주가 1:1 로 대응하는 표현만** 남긴다.
 *
 *  제거한 매핑과 이유:
 *   · 정규직·상용직 → FULL_TIME  ✗ 한국어 "정규직"은 **고용 기간의 무기한성**이고
 *     Google `FULL_TIME` 은 **근로시간**이다. 정규직이면서 단시간 근로가 가능하다.
 *   · 계약직·기간제 → CONTRACTOR ✗ 기간제 **근로자**이지 도급·프리랜서가 아니다.
 *   · 임시직 → TEMPORARY         ✗ 한국 노동통계의 "임시직"은 1개월~1년 기간제에 가까워
 *     Google 의 단기 임시직과 경계가 다르다.
 *
 *  남긴 매핑(의미가 그대로 겹치는 것만):
 *   · 시간제·단시간·파트타임 → PART_TIME   (둘 다 **근로시간**을 가리킨다)
 *   · 일용직·일용근로      → PER_DIEM     (둘 다 **일 단위** 고용이다)
 *   · 인턴                → INTERN
 *   · 자원봉사            → VOLUNTEER
 *
 * 🔴 급여 단위(시급/월급)로 전일제 여부를 추론하지 않는다 — **시급 전일제가 흔하다.**
 *    1차 보고에서 "시급직이라 FULL_TIME 이 틀렸다"고 쓴 것은 잘못된 근거였다.
 *    FULL_TIME 이 틀린 진짜 이유는 **아무 출처 없이 상수로 박혀 있었기 때문**이다.
 */
const EMPLOYMENT_TYPE_MAP: ReadonlyArray<readonly [RegExp, (typeof EMPLOYMENT_TYPE_VALUES)[number]]> = [
  [/파트\s*타임|시간\s*제|단시간/, 'PART_TIME'],
  [/일용\s*(?:직|근로)/, 'PER_DIEM'],
  [/인턴/, 'INTERN'],
  [/자원\s*봉사|봉사\s*직/, 'VOLUNTEER'],
]

/**
 * 매핑을 **포기해야 하는** 신호.
 * · 부정 — "시간제 아님", "파트타임 불가"
 * · 혼합 — 서로 다른 범주가 같이 등장하거나, 매핑 대상 밖의 고용형태 어휘가 섞임
 */
const NEGATION_RE = /(아님|아닌|불가|제외|없음|미해당|불가능)/
/** 매핑하지 않기로 한 고용형태 어휘 — 이것이 섞여 있으면 문장이 단일 범주가 아니다 */
const UNMAPPED_TYPE_RE = /(정규직|상용직|계약직|기간제|임시직|전일제|무기계약)/

export function mapEmploymentType(jobType: string | null | undefined): string[] | null {
  if (!jobType) return null
  const s = jobType.replace(/\s+/g, ' ').trim()
  if (s === '') return null

  // 부정 문구가 있으면 무엇을 긍정하는지 알 수 없다
  if (NEGATION_RE.test(s)) return null

  const matched = new Set<string>()
  for (const [re, value] of EMPLOYMENT_TYPE_MAP) {
    if (re.test(s)) matched.add(value)
  }
  if (matched.size === 0) return null
  // 서로 다른 범주가 섞였다 → 단정할 수 없다
  if (matched.size > 1) return null
  // 매핑 대상 밖 고용형태 어휘가 함께 있다 → 혼합 표현이다
  if (UNMAPPED_TYPE_RE.test(s)) return null

  return [...matched]
}

/* ────────────────────────────────────────────────────────────
 * ③ baseSalary
 * ──────────────────────────────────────────────────────────── */

const money = (minValue: number, maxValue: number, unitText: MonetaryAmount['value']['unitText']): MonetaryAmount => ({
  '@type': 'MonetaryAmount',
  currency: 'KRW',
  value: {
    '@type': 'QuantitativeValue',
    minValue: Math.min(minValue, maxValue),
    maxValue: Math.max(minValue, maxValue),
    unitText,
  },
})

interface Amounts { unit: 'MONTH' | 'HOUR'; min: number; max: number }

/**
 * 문자열에서 **고용주가 준 단위와 금액**을 읽는다. 단위를 못 읽으면 `null`.
 *
 * 🔴 단위 없는 숫자(`3000000`)는 `null` 이다. `formatSalary` 는 임계값으로 월/시급을
 *    **추정**하지만 그건 우리 추정이지 고용주가 제시한 단위가 아니다.
 */
function readAmounts(text: string | null | undefined): Amounts | null {
  if (!text) return null
  const s = text.replace(/,/g, '').replace(/\s+/g, ' ').trim()
  if (s === '' || s.includes('협의')) return null

  const unitOf = (label: string): Amounts['unit'] | null =>
    /시급/.test(label) ? 'HOUR' : /^(월|월급)$/.test(label) ? 'MONTH' : null

  // "월 216~240만원" · "시급 1.3만원"  (만원 단위)
  const man = s.match(/^(시급|월급|월)\s*([\d.]+)(?:\s*[~\-]\s*([\d.]+))?\s*만원?$/)
  if (man) {
    const unit = unitOf(man[1])
    if (!unit) return null
    const lo = Number(man[2]) * 10000
    const hi = man[3] ? Number(man[3]) * 10000 : lo
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
    return { unit, min: Math.min(lo, hi), max: Math.max(lo, hi) }
  }

  // "시급 10030원" · "월급 2800000원 ~ 3000000원"  (원 단위)
  const won = s.match(/^(시급|월급|월)\s*(\d+)\s*원?(?:\s*[~\-]\s*(\d+)\s*원?)?$/)
  if (won) {
    const unit = unitOf(won[1])
    if (!unit) return null
    const lo = Number(won[2])
    const hi = won[3] ? Number(won[3]) : lo
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
    return { unit, min: Math.min(lo, hi), max: Math.max(lo, hi) }
  }

  return null
}

/**
 * `baseSalary` — **원본과 화면이 무손실로 일치할 때만** 내보낸다.
 *
 * 왜 둘 다 보나: 구조화 데이터는 ⑴ 고용주가 제시한 금액이어야 하고(Google)
 * ⑵ 화면에 보이는 값과 일치해야 한다(Google). 그런데 `formatSalary()` 가
 * 원본을 화면 문자열로 바꾸는 과정에서 아래 손실이 일어난다:
 *
 *   · 범위 소실  "월급 2,800,000원 ~ 3,000,000원" → "월 300만원"   (low 가 버려진다)
 *   · 반올림     "2,588,000"                     → "월 259만원"   (2,590,000 으로 +5,000)
 *   · 단위 추정  "3000000"                       → "월 300만원"   (임계값 추정)
 *
 * 손실이 있으면 ⑴과 ⑵를 **동시에** 만족시킬 수 없다 → **생략**한다.
 *
 * ※ 화면 함수(`lib/format.ts`)는 공용 파일이라 이번에 바꾸지 않았다(소유권 미확정).
 *   화면 표기를 무손실로 바꾸면 그때 더 많은 건이 자격을 얻는다.
 */
export function resolveBaseSalary(input: { raw: string | null | undefined; display: string | null | undefined }): MonetaryAmount | null {
  const fromRaw = readAmounts(input.raw)
  if (!fromRaw) return null
  const fromDisplay = readAmounts(input.display)
  if (!fromDisplay) return null

  const lossless =
    fromRaw.unit === fromDisplay.unit &&
    fromRaw.min === fromDisplay.min &&
    fromRaw.max === fromDisplay.max
  if (!lossless) return null

  return money(fromRaw.min, fromRaw.max, fromRaw.unit)
}

/* ────────────────────────────────────────────────────────────
 * 빌더
 * ──────────────────────────────────────────────────────────── */

export interface JobPostingInput {
  id: string
  title: string
  /** HTML 제거한 본문 평문 */
  plainContent: string
  company: string
  region: string
  location: string
  /** `JobDetail.salary` 원본 */
  salaryRaw: string | null
  /** `formatSalary()` 가 만든 **화면** 문자열 */
  salaryDisplay: string
  /** ISO 8601 */
  createdAt: string
  applyUrl: string | null
  /** `JobDetail.jobType` — 자유 한국어. 없으면 null */
  jobType: string | null
  /** `JobDetail.expiresAt` — ISO 8601. 없으면 null (현재 쓰는 코드가 없어 항상 null) */
  expiresAt: string | null
  siteOrigin: string
}

/** 설명문 상한 — 기존 동작 유지 */
const DESCRIPTION_MAX = 500

export function buildJobPostingJsonLd(i: JobPostingInput): Record<string, unknown> {
  const baseSalary = resolveBaseSalary({ raw: i.salaryRaw, display: i.salaryDisplay })
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
    // 아래 넷은 **근거를 확인했을 때만** 넣는다. 키가 남지 않게 spread 로 붙인다.
    ...(baseSalary ? { baseSalary } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(directApply === undefined ? {} : { directApply }),
    ...(i.expiresAt ? { validThrough: i.expiresAt } : {}),
  }
}
