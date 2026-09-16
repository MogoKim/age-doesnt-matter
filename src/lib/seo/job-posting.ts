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
 * 🔴 **명확한 고용형태 표현 전체**만 허용한다. 자유 문장의 **부분 문자열**로 판정하지 않는다.
 *
 *  이전 구현은 정규식을 자유 문장에 그대로 돌려 설명문에 섞인 어휘를 잡았다(실측):
 *    "인턴십 경험 우대"      → INTERN     ✗ 자격요건이지 고용형태가 아니다
 *    "자원봉사 경험 우대"    → VOLUNTEER  ✗
 *    "단시간 집중 교육 제공" → PART_TIME  ✗
 *    "근무시간제 협의"       → PART_TIME  ✗ ("시간제" 가 부분 일치)
 *    "일용직 경력 우대"      → PER_DIEM   ✗
 *
 *  → 값을 구분자로 쪼갠 뒤 **모든 토큰이 허용 표현이어야** 하고 **전부 같은 범주**여야 한다.
 *    모르는 토큰이 하나라도 있으면 설명문·혼합·부정으로 보고 생략한다.
 *
 *  허용 표현(의미가 그대로 겹치는 것만):
 *   · 시간제 · 단시간 · 파트타임 → PART_TIME  (둘 다 **근로시간**을 가리킨다)
 *   · 인턴                      → INTERN
 *   · 자원봉사                  → VOLUNTEER
 *
 *  제거한 매핑과 이유:
 *   · 정규직·상용직 → FULL_TIME  ✗ "정규직"은 **고용 기간의 무기한성**이고
 *     Google `FULL_TIME` 은 **근로시간**이다. 정규직이면서 단시간 근로가 가능하다.
 *   · 계약직·기간제 → CONTRACTOR ✗ 기간제 **근로자**이지 도급·프리랜서가 아니다.
 *   · 임시직 → TEMPORARY         ✗ 한국 "임시직"은 1개월~1년 기간제에 가까워 경계가 다르다.
 *   · 일용직·일용근로 → PER_DIEM ✗ Google `PER_DIEM` 은 **일당제(급여 단위)** 를 뜻한다.
 *     한국어 "일용직"은 고용 형태이고 급여가 일당인지는 별개다. 현재 코퍼스의 급여는
 *     전부 시급·월급이라 **일 단위 급여 근거가 없다.** 근거가 생기기 전에는 만들지 않는다.
 *
 * 🔴 급여 단위(시급/월급)로 전일제 여부를 추론하지 않는다 — **시급 전일제가 흔하다.**
 *    1차 보고의 "시급직이라 FULL_TIME 이 틀렸다"는 잘못된 근거였다. 진짜 이유는
 *    **아무 출처 없이 상수로 박혀 있었기 때문**이다(`jobType` 은 select 조차 되지 않았다).
 */
const EMPLOYMENT_TYPE_TERMS: ReadonlyMap<string, (typeof EMPLOYMENT_TYPE_VALUES)[number]> = new Map([
  ['시간제', 'PART_TIME'],
  ['단시간', 'PART_TIME'],
  ['파트타임', 'PART_TIME'],
  ['인턴', 'INTERN'],
  ['자원봉사', 'VOLUNTEER'],
])

/** 동의어 나열에 쓰이는 구분자. 그 외 문자가 붙으면 토큰이 달라져 자동으로 탈락한다. */
const TERM_SEPARATOR = /(?:또는)|[/,·()\s]+/

export function mapEmploymentType(jobType: string | null | undefined): string[] | null {
  if (!jobType) return null
  // 앞뒤 공백·마침표 정도는 견딘다. 그 외 문자는 토큰 안에 남아 불일치가 된다.
  const s = jobType.replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  if (s === '') return null

  const tokens = s.split(TERM_SEPARATOR).map((t) => t.trim()).filter((t) => t !== '')
  if (tokens.length === 0) return null

  const categories = new Set<string>()
  for (const t of tokens) {
    const v = EMPLOYMENT_TYPE_TERMS.get(t)
    if (!v) return null
    categories.add(v)
  }
  if (categories.size !== 1) return null

  return [...categories]
}

/* ────────────────────────────────────────────────────────────
 * ③ baseSalary
 * ──────────────────────────────────────────────────────────── */

/**
 * 🔴 여기서 값을 **뒤집어 고치지 않는다.**
 *    "월 300~216만원" 은 데이터가 잘못된 것이지 "216~300만원" 이라는 뜻이 아니다.
 *    역순 판정은 `readAmounts` 가 하고, 여기 오는 값은 이미 min ≤ max 다.
 */
const money = (minValue: number, maxValue: number, unitText: MonetaryAmount['value']['unitText']): MonetaryAmount => ({
  '@type': 'MonetaryAmount',
  currency: 'KRW',
  value: {
    '@type': 'QuantitativeValue',
    minValue,
    maxValue,
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
    // 🔴 역순은 정렬하지 않고 생략한다 — 자동 교정은 원본에 없는 사실을 만든다
    if (lo > hi) return null
    return { unit, min: lo, max: hi }
  }

  // "시급 10030원" · "월급 2800000원 ~ 3000000원"  (원 단위)
  const won = s.match(/^(시급|월급|월)\s*(\d+)\s*원?(?:\s*[~\-]\s*(\d+)\s*원?)?$/)
  if (won) {
    const unit = unitOf(won[1])
    if (!unit) return null
    const lo = Number(won[2])
    const hi = won[3] ? Number(won[3]) : lo
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
    // 🔴 역순은 정렬하지 않고 생략한다 — 자동 교정은 원본에 없는 사실을 만든다
    if (lo > hi) return null
    return { unit, min: lo, max: hi }
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
