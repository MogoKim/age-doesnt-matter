/**
 * JobPosting — **근거 없는 값을 만들지 않는다** (Batch C-1 재리뷰 보정)
 *
 * 1차 구현이 세 군데서 **추정을 사실처럼** 내보내고 있었다. 각각을 여기서 먼저 재현한다.
 *
 * ① directApply
 *    "자사 도메인" 또는 "본문에 전화번호/이메일" 만으로 true 를 만들었다.
 *    · 자사 도메인이라는 사실은 **그 URL 에서 지원이 완료된다**는 증거가 아니다.
 *      실제로 사이트 안에 지원 라우트가 없다(`src/app/(main)/jobs/` = `[id]` · `region` 뿐).
 *    · 본문의 전화번호·이메일이 **채용 회사(또는 대리인)의 지원 연락처**라는 보장이 없다.
 *      기관 대표번호·원문 출처 안내·무관한 숫자열일 수 있다.
 *    → 근거가 부족하면 **생략**한다. Google 기준상 directApply 는 권장 필드다.
 *
 * ② employmentType
 *    정규직·상용직 → FULL_TIME, 기간제·계약직 → CONTRACTOR 로 매핑했다. **범주가 다르다.**
 *    · 한국어 "정규직"은 **고용 기간의 무기한성**이고 Google `FULL_TIME` 은 **근로시간**이다.
 *      정규직이면서 단시간 근로일 수 있다.
 *    · "계약직/기간제"는 **기간제 근로자**이고 Google `CONTRACTOR` 는 **도급·프리랜서**다.
 *    → 의미가 1:1 로 대응하는 표현만 남긴다. 부정·혼합 표현도 걸러낸다.
 *
 *    🔴 아울러 1차 보고의 근거를 정정한다: "시급직이므로 FULL_TIME 이 틀렸다"고 썼는데
 *       **시급 여부는 전일제 여부를 결정하지 않는다**(시급 전일제가 흔하다).
 *       FULL_TIME 이 틀린 진짜 이유는 **아무 출처 없이 상수로 박아넣었기 때문**이다
 *       (`jobType` 은 쿼리에 select 조차 되지 않았다).
 *
 * ③ baseSalary
 *    "화면 문자열을 파싱하니 정확하다"고 봤지만, **원본→화면 단계에서 이미 손실**이 있다:
 *      · 범위 소실   "월급 2,800,000원 ~ 3,000,000원" → "월 300만원"  (low 버림)
 *      · 반올림      "2,588,000"                    → "월 259만원"  (2,590,000 로 5,000원 증가)
 *      · 단위 추정   "3000000"                      → "월 300만원"  (고용주가 준 단위가 아님)
 *    → 원본과 화면이 **무손실로 일치할 때만** 내보낸다. 아니면 생략한다.
 *      (화면 함수 `lib/format.ts` 는 공용 파일이라 이번에 바꾸지 않는다 — 소유권 미확정)
 */
import { describe, expect, it } from 'vitest'
import { formatSalary } from '@/lib/format'
import {
  resolveDirectApply,
  mapEmploymentType,
  resolveBaseSalary,
  buildJobPostingJsonLd,
} from '@/lib/seo/job-posting'

const SITE = 'https://age-doesnt-matter.com'
const WORK24 = 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=K12'

describe('① directApply — 근거가 없으면 만들지 않는다', () => {
  it('🔴 자사 도메인 URL 이라는 사실만으로 true 를 만들지 않는다', () => {
    expect(resolveDirectApply({ applyUrl: `${SITE}/jobs/apply/abc`, plainContent: '', siteOrigin: SITE })).toBeUndefined()
  })

  it('🔴 본문 전화번호만으로 true 를 만들지 않는다 — 채용사 지원 연락처라는 보장이 없다', () => {
    expect(resolveDirectApply({ applyUrl: WORK24, plainContent: '문의 02-123-4567', siteOrigin: SITE })).toBeUndefined()
  })

  it('🔴 본문 이메일만으로 true 를 만들지 않는다', () => {
    expect(resolveDirectApply({ applyUrl: WORK24, plainContent: '이력서는 hr@example.com 으로', siteOrigin: SITE })).toBeUndefined()
  })

  it('🔴 외부 포털이라고 false 로 단정하지도 않는다 — 그 포털에서 지원이 끝날 수도 있다', () => {
    expect(resolveDirectApply({ applyUrl: WORK24, plainContent: '요양보호사 모집', siteOrigin: SITE })).toBeUndefined()
  })

  it('지원 URL 이 없으면 당연히 생략', () => {
    expect(resolveDirectApply({ applyUrl: null, plainContent: '', siteOrigin: SITE })).toBeUndefined()
  })

  it('🔴 빌더 결과에 directApply 키가 아예 없다', () => {
    const ld = buildJobPostingJsonLd(baseInput({ applyUrl: WORK24, plainContent: '문의 010-1234-5678 hr@x.com' }))
    expect('directApply' in ld).toBe(false)
  })
})

describe('② employmentType — 범주가 다른 추정 매핑을 제거한다', () => {
  it('🔴 정규직 → FULL_TIME 매핑을 하지 않는다 (기간 무기한 ≠ 근로시간 전일제)', () => {
    expect(mapEmploymentType('정규직')).toBeNull()
    expect(mapEmploymentType('상용직')).toBeNull()
  })

  it('🔴 계약직·기간제 → CONTRACTOR 매핑을 하지 않는다 (기간제 근로자 ≠ 도급·프리랜서)', () => {
    expect(mapEmploymentType('계약직')).toBeNull()
    expect(mapEmploymentType('기간제')).toBeNull()
  })

  it('🔴 임시직 → TEMPORARY 도 하지 않는다 (한국 "임시직"은 1개월~1년 기간제에 가깝다)', () => {
    expect(mapEmploymentType('임시직')).toBeNull()
  })

  it('의미가 1:1 인 표현만 남긴다', () => {
    expect(mapEmploymentType('시간제')).toEqual(['PART_TIME'])
    expect(mapEmploymentType('단시간')).toEqual(['PART_TIME'])
    expect(mapEmploymentType('파트타임')).toEqual(['PART_TIME'])
    expect(mapEmploymentType('일용직')).toEqual(['PER_DIEM'])
    expect(mapEmploymentType('인턴')).toEqual(['INTERN'])
    expect(mapEmploymentType('자원봉사')).toEqual(['VOLUNTEER'])
  })

  it('🔴 부정 문구가 붙으면 매핑하지 않는다', () => {
    for (const s of ['시간제 아님', '파트타임 불가', '시간제 제외', '단시간 근로 없음', '인턴 아닌']) {
      expect(mapEmploymentType(s), s).toBeNull()
    }
  })

  it('🔴 서로 다른 범주가 섞이면 매핑하지 않는다', () => {
    for (const s of ['정규직/계약직', '시간제 또는 전일제', '인턴·정규직 전환', '일용직, 시간제']) {
      expect(mapEmploymentType(s), s).toBeNull()
    }
  })

  it('같은 범주의 동의어가 겹치는 건 허용한다', () => {
    expect(mapEmploymentType('시간제(파트타임)')).toEqual(['PART_TIME'])
  })
})

describe('③ baseSalary — 원본→화면 손실이 있으면 생략한다', () => {
  const check = (raw: string) => resolveBaseSalary({ raw, display: formatSalary(raw) })

  it('🔴 원-단위 범위는 화면에서 low 가 버려진다 → 생략', () => {
    expect(formatSalary('월급 2,800,000원 ~ 3,000,000원')).toBe('월 300만원')
    expect(check('월급 2,800,000원 ~ 3,000,000원')).toBeNull()
  })

  it('🔴 반올림이 일어나면 생략한다 (2,588,000 → 월 259만원 = 2,590,000)', () => {
    expect(formatSalary('2,588,000')).toBe('월 259만원')
    expect(check('2,588,000')).toBeNull()
  })

  it('🔴 단위 없는 숫자는 생략한다 — 임계값 추정은 고용주가 준 단위가 아니다', () => {
    expect(check('3000000')).toBeNull()
    expect(check('2345678원')).toBeNull()
  })

  it('무손실이면 그대로 내보낸다 — 만원 범위', () => {
    const v = check('월 216~240만원')!.value
    expect(v).toMatchObject({ minValue: 2160000, maxValue: 2400000, unitText: 'MONTH' })
  })

  it('무손실이면 그대로 내보낸다 — 시급', () => {
    expect(check('시급 1만원')!.value).toMatchObject({ minValue: 10000, maxValue: 10000, unitText: 'HOUR' })
    expect(check('시급 1.3만원')!.value).toMatchObject({ minValue: 13000, maxValue: 13000, unitText: 'HOUR' })
  })

  it('무손실이면 그대로 내보낸다 — 원 단위 시급', () => {
    expect(formatSalary('시급 10030원')).toBe('시급 10,030원')
    expect(check('시급 10030원')!.value).toMatchObject({ minValue: 10030, maxValue: 10030, unitText: 'HOUR' })
  })

  it('급여 협의·빈값은 생략', () => {
    expect(check('')).toBeNull()
    expect(check('회사 내규에 따름')).toBeNull()
  })

  it('🔴 내보낸 값은 화면 문자열과도 일치한다 — 둘이 갈리면 Google 위반', () => {
    for (const raw of ['월 216~240만원', '시급 1만원', '시급 10030원', '월 227만원']) {
      const display = formatSalary(raw)
      const v = resolveBaseSalary({ raw, display })!.value
      const reparsed = resolveBaseSalary({ raw: display, display })!.value
      expect(v, raw).toEqual(reparsed)
    }
  })
})

function baseInput(over: Partial<Parameters<typeof buildJobPostingJsonLd>[0]> = {}) {
  return {
    id: 'cmsshaxui0004mj4s1qoh0krn',
    title: '[서울 강서구] 요양보호사',
    plainContent: '재가 요양보호사를 모집합니다.',
    company: '수호천사재가복지센터',
    region: '서울 강서구',
    location: '서울 강서구',
    salaryRaw: '시급 1만원',
    salaryDisplay: '시급 1만원',
    createdAt: '2026-08-14T05:00:31.211Z',
    applyUrl: WORK24,
    jobType: null,
    expiresAt: null,
    siteOrigin: SITE,
    ...over,
  }
}

describe('빌더 — Required 는 유지하고 나머지는 근거가 있을 때만', () => {
  it('Required 필드는 그대로다', () => {
    const ld = buildJobPostingJsonLd(baseInput())
    expect(ld['@type']).toBe('JobPosting')
    for (const k of ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation']) {
      expect(ld[k], k).toBeTruthy()
    }
  })

  it('🔴 근거 없는 세 필드가 전부 빠진다', () => {
    const ld = buildJobPostingJsonLd(baseInput({ jobType: '정규직', salaryRaw: '3000000', salaryDisplay: formatSalary('3000000') }))
    expect('directApply' in ld).toBe(false)
    expect('employmentType' in ld).toBe(false)
    expect('baseSalary' in ld).toBe(false)
  })

  it('근거가 있으면 들어간다', () => {
    const ld = buildJobPostingJsonLd(baseInput({ jobType: '시간제', salaryRaw: '월 216~240만원', salaryDisplay: '월 216~240만원' }))
    expect(ld.employmentType).toEqual(['PART_TIME'])
    expect((ld.baseSalary as Record<string, Record<string, unknown>>).value).toMatchObject({ minValue: 2160000, maxValue: 2400000 })
  })
})
