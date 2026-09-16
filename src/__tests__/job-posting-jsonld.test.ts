/**
 * JobPosting 구조화 데이터 계약 (Batch C-1)
 *
 * ── 실측 근거 (2026-09-16, production 50건 전수) ───────────────
 *  · `employmentType: 'FULL_TIME'` 이 **50/50 하드코딩**이었다.
 *    🔴 틀린 이유는 "시급직이라서"가 아니다 — **시급 여부는 전일제 여부를 결정하지 않는다**
 *       (시급 전일제가 흔하다). 틀린 이유는 **아무 출처 없이 상수로 박혀 있었기 때문**이다
 *       (`jobType` 은 쿼리에 select 조차 되지 않았다).
 *  · `directApply: true` 가 **50/50**. 지원 흐름을 확인할 수단이 없는데도 참을 선언했다.
 *    (판정 근거는 `job-posting-evidence.test.ts` 로 옮겼다 — 근거 없으면 생략한다)
 *  · `baseSalary` 가 **26/50** 뿐이다. 빠진 24건은 전부 `시급 …` 표기 —
 *    파서 정규식이 `월 N만원` 만 보기 때문이다. Google 은 `HOUR` 를 허용한다.
 *    🔴 다만 "시급을 넣으면 끝"이 아니다 — 원본→화면 단계의 손실(범위 소실·반올림·
 *       단위 추정) 때문에 **무손실인 건만** 내보낸다(`job-posting-evidence.test.ts`).
 *  · `validThrough` 는 0/50. `JobDetail.expiresAt` 에 **쓰는 코드가 어디에도 없다**(항상 NULL).
 *
 * ── Google 공식 기준 (developers.google.com/search/docs/appearance/structured-data/job-posting)
 *  · `employmentType` — **권장**. 허용값은 FULL_TIME · PART_TIME · CONTRACTOR · TEMPORARY ·
 *    INTERN · VOLUNTEER · PER_DIEM · OTHER 뿐이다(대소문자 구분).
 *    🔴 모르면 **넣지 않는다.** 틀린 값보다 없는 게 낫다.
 *  · `baseSalary.value.unitText` — HOUR · DAY · WEEK · MONTH · YEAR.
 *  · `directApply` — "이 공고 URL 이 **직접 지원**을 가능하게 하는가".
 *    셋 중 하나면 true: ① 사이트 안에서 지원 완료(다중 로그인 없이)
 *    ② 공고에 **직접 연락처(이메일·전화)** 포함 ③ 면접 일정 예약 가능.
 *    🔴 "외부 링크"라는 사실 하나로 단정하지 않는다 — ②③ 까지 확인해야 한다.
 *  · `validThrough` — "만료가 없거나 **만료를 모르면 아예 생략**한다."
 *    🔴 즉 지금의 생략은 **결함이 아니라 정답**이다. 날짜를 지어내지 않는다.
 *
 * ── 이 테스트가 고정하는 것 ─────────────────────────────────
 *  구조화 데이터는 **화면에 보이는 값과 일치**해야 한다. 그래서 급여는 사용자가 보는
 *  정규화 문자열(`formatSalary` 출력)을 파싱한다 — 두 곳이 갈리면 Google 위반이다.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveBaseSalary,
  mapEmploymentType,
  buildJobPostingJsonLd,
  EMPLOYMENT_TYPE_VALUES,
} from '@/lib/seo/job-posting'

/** 원본과 화면이 같은(무손실) 입력만 다룬다 — 손실 케이스는 evidence 테스트가 본다 */
const parseBaseSalary = (s: string) => resolveBaseSalary({ raw: s, display: s })

const SITE = 'https://age-doesnt-matter.com'

describe('parseBaseSalary — 화면 표기와 일치해야 한다', () => {
  it('🔴 시급을 HOUR 로 파싱한다 (현재 24/50 이 통째로 누락)', () => {
    expect(parseBaseSalary('시급 1만원')).toEqual({
      '@type': 'MonetaryAmount',
      currency: 'KRW',
      value: { '@type': 'QuantitativeValue', minValue: 10000, maxValue: 10000, unitText: 'HOUR' },
    })
  })

  it('🔴 시급 소수(1.3만원 = 13,000원)도 정확히 파싱한다', () => {
    const v = parseBaseSalary('시급 1.3만원')!.value
    expect(v.minValue).toBe(13000)
    expect(v.maxValue).toBe(13000)
  })

  it('월급 단일값은 기존과 같다 (회귀 금지)', () => {
    const v = parseBaseSalary('월 227만원')!.value as Record<string, unknown>
    expect(v).toMatchObject({ minValue: 2270000, maxValue: 2270000, unitText: 'MONTH' })
  })

  it('월급 범위도 기존과 같다 (회귀 금지)', () => {
    const v = parseBaseSalary('월 216~240만원')!.value as Record<string, unknown>
    expect(v).toMatchObject({ minValue: 2160000, maxValue: 2400000, unitText: 'MONTH' })
  })

  it('🔴 "급여 협의"는 값을 만들지 않는다 — 모르는 값을 지어내지 않는다', () => {
    expect(parseBaseSalary('급여 협의')).toBeNull()
    expect(parseBaseSalary('')).toBeNull()
    expect(parseBaseSalary('회사 내규에 따름')).toBeNull()
  })

  it('unitText 는 Google 허용값만 쓴다', () => {
    for (const s of ['시급 1만원', '월 227만원', '월 216~240만원']) {
      const v = parseBaseSalary(s)!.value as { unitText: string }
      expect(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']).toContain(v.unitText)
    }
  })

  it('최소값이 최대값보다 클 수 없다', () => {
    const v = parseBaseSalary('월 300~216만원')!.value as { minValue: number; maxValue: number }
    expect(v.minValue).toBeLessThanOrEqual(v.maxValue)
  })
})

describe('mapEmploymentType — 모르면 넣지 않는다', () => {
  it('🔴 값이 없으면 null (FULL_TIME 을 임의로 채우지 않는다)', () => {
    expect(mapEmploymentType(null)).toBeNull()
    expect(mapEmploymentType('')).toBeNull()
    expect(mapEmploymentType('   ')).toBeNull()
  })

  it('🔴 해석할 수 없는 한국어는 null — 추측하지 않는다', () => {
    expect(mapEmploymentType('기간의 정함이 없는 근로계약')).toBeNull()
    expect(mapEmploymentType('알 수 없음')).toBeNull()
  })

  it('의미가 1:1 인 표현만 매핑한다 (범주가 다른 추정 매핑은 evidence 테스트가 막는다)', () => {
    expect(mapEmploymentType('시간제')).toEqual(['PART_TIME'])
    expect(mapEmploymentType('파트타임')).toEqual(['PART_TIME'])
    expect(mapEmploymentType('일용직')).toEqual(['PER_DIEM'])
    expect(mapEmploymentType('인턴')).toEqual(['INTERN'])
  })

  it('매핑 결과는 전부 Google 허용 enum 이다', () => {
    for (const k of ['시간제', '일용직', '인턴', '파트타임', '자원봉사']) {
      for (const v of mapEmploymentType(k)!) expect(EMPLOYMENT_TYPE_VALUES).toContain(v)
    }
  })
})

// directApply 판정은 `job-posting-evidence.test.ts` 가 전담한다 —
// "근거가 없으면 생략" 계약이라 여기서 중복 고정하지 않는다.

describe('buildJobPostingJsonLd — 전체 계약', () => {
  const base = {
    id: 'cmsshaxui0004mj4s1qoh0krn',
    title: '[서울 강서구] 요양보호사',
    plainContent: '재가 요양보호사를 모집합니다. 경력 무관, 4대보험 가입.',
    company: '수호천사재가복지센터',
    region: '서울 강서구',
    location: '서울 강서구',
    salaryRaw: '시급 1만원',
    salaryDisplay: '시급 1만원',
    createdAt: '2026-08-14T05:00:31.211Z',
    applyUrl: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=K12',
    jobType: null as string | null,
    expiresAt: null as string | null,
    siteOrigin: SITE,
  }

  it('🔴 필수 필드는 전부 있다 (Google Required)', () => {
    const ld = buildJobPostingJsonLd(base)
    expect(ld['@type']).toBe('JobPosting')
    expect(ld.title).toBe(base.title)
    expect(ld.datePosted).toBe(base.createdAt)
    expect(ld.hiringOrganization).toMatchObject({ '@type': 'Organization', name: base.company })
    expect((ld.jobLocation as Record<string, Record<string, string>>).address.addressCountry).toBe('KR')
    expect(typeof ld.description).toBe('string')
  })

  it('🔴 jobType 이 없으면 employmentType 키 자체가 없다', () => {
    expect('employmentType' in buildJobPostingJsonLd(base)).toBe(false)
  })

  it('🔴 시급 공고도 원본=화면(무손실)이면 baseSalary 가 생긴다', () => {
    const v = (buildJobPostingJsonLd(base).baseSalary as Record<string, Record<string, unknown>>).value
    expect(v).toMatchObject({ minValue: 10000, unitText: 'HOUR' })
  })

  it('🔴 지원 흐름을 확인할 수 없으므로 directApply 키가 없다', () => {
    expect('directApply' in buildJobPostingJsonLd(base)).toBe(false)
  })

  it('🔴 expiresAt 이 null 이면 validThrough 키가 없다 — Google 지침대로 "모르면 생략"', () => {
    expect('validThrough' in buildJobPostingJsonLd(base)).toBe(false)
  })

  it('🔴 expiresAt 이 있으면 ISO 8601 로 넣는다', () => {
    const ld = buildJobPostingJsonLd({ ...base, expiresAt: '2026-10-31T14:59:59.000Z' })
    expect(ld.validThrough).toBe('2026-10-31T14:59:59.000Z')
    expect(new Date(ld.validThrough as string).toISOString()).toBe(ld.validThrough)
  })

  it('매핑 가능한 jobType 은 employmentType 으로 나간다', () => {
    expect(buildJobPostingJsonLd({ ...base, jobType: '시간제' }).employmentType).toEqual(['PART_TIME'])
  })

  it('회사명이 비어도 Required 를 깨지 않는다 (기존 fallback 유지)', () => {
    const ld = buildJobPostingJsonLd({ ...base, company: '' })
    expect((ld.hiringOrganization as Record<string, string>).name).toBeTruthy()
  })

  it('JSON 직렬화 가능하고 undefined 키가 남지 않는다', () => {
    const ld = buildJobPostingJsonLd(base)
    const round = JSON.parse(JSON.stringify(ld))
    expect(Object.values(round).every((v) => v !== undefined)).toBe(true)
    expect(JSON.stringify(ld)).not.toContain('undefined')
  })

  it('🔴 급여를 모르면 baseSalary 키가 없다', () => {
    expect('baseSalary' in buildJobPostingJsonLd({ ...base, salaryRaw: '', salaryDisplay: '급여 협의' })).toBe(false)
  })
})
