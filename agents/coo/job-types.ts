/**
 * 일자리 자동화 — 타입 정의
 * 50plus.or.kr 크롤링 → AI 가공 → DB 저장 파이프라인
 */

/** 크롤링으로 수집한 원시 일자리 데이터 */
export interface RawJob {
  sourceId: string        // 50plus.or.kr 내부 공고 ID
  sourceUrl: string       // 원본 공고 URL
  title: string           // 원시 제목
  company: string         // 회사명
  location: string        // 근무지 주소
  region: string          // 지역 (서울, 경기, 부산 등)
  salary?: string         // 급여 정보
  workHours?: string      // 근무시간
  workDays?: string       // 근무일
  jobType?: string        // 고용형태 (정규직, 계약직 등)
  applyUrl?: string       // 지원 링크
  description?: string    // 상세 설명 (AI 가공용)
  deadline?: string       // 마감일
  postedAt?: string       // 게시일
}

/** Waterfall 우선순위 Tier */
export type JobTier = 1 | 2 | 3 | 4

/** 필터링된 일자리 (Tier + 쿼터 메타데이터 포함) */
export interface FilteredJob extends RawJob {
  tier: JobTier
  isFemaleFriendly: boolean
  isMetro: boolean         // 수도권 여부
}

/** AI 가공 결과 */
export interface ProcessedJob {
  cleanTitle: string       // 정제된 제목: [지역] 회사명 직무명
  subtitle: string         // 감성 서브타이틀
  seoKeywords: string[]    // SEO 키워드 4개 (숨김, 검색용)
  displayTags: string[]    // 사용자 표시 태그 최대 3개 (나이무관, 초보환영 등)
  pickPoints: PickPoint[]  // Pick 포인트 5개
  qna: QnA[]              // Q&A 3개
}

export interface PickPoint {
  point: string            // "주 5일 근무, 토·일 휴무"
  icon: string             // "🕐"
}

export interface QnA {
  q: string                // "50대도 지원할 수 있나요?"
  a: string                // "네, 50~65세 지원 가능합니다."
}

/** DB에 저장할 최종 데이터 */
export interface JobToPublish {
  raw: FilteredJob
  processed: ProcessedJob
  content: string          // HTML 본문 (8섹션 구조)
}

/** Waterfall 필터링 설정 */
export interface FilterConfig {
  batchSize: number        // 1배치 목표 건수 (4-5)
  femaleQuota: number      // 여성 직무 최소 비율 (0.6)
  metroQuota: number       // 수도권 비율 (0.5)
}

/** 크롤링 설정 */
export interface ScraperConfig {
  maxPages: number         // 최대 크롤링 페이지 수
  baseUrl: string          // 50plus.or.kr 베이스 URL
}

// ── 키워드 상수 ──

/** Top-Tier: 대기업/공공기관 키워드 */
export const TOP_TIER_KEYWORDS = [
  '삼성', '현대', 'LG', 'SK', '롯데', '신세계', 'CJ', 'GS', '한화', '포스코',
  '은행', '카드', '보험', '증권', '공사', '공단', '재단', '공무원', '시청', '구청',
  '도청', '교육청', '대학교', '병원', '의료원',
]

/** Sweet-Spot: 시니어 선호 직무 키워드 */
export const SWEET_SPOT_KEYWORDS = [
  '사무', '행정', '안내', '경비', '보안', '주차관리', '운전',
  '코디네이터', '상담', '고객응대', '접수',
]

/** 여성 선호 직무 키워드 */
export const FEMALE_FRIENDLY_KEYWORDS = [
  '강사', '돌봄', '요양', '바리스타', '카페', '상담', '코디네이터',
  '교육', '봉사', '간호', '보육', '사서', '안내', '접수',
  '조리', '영양', '세탁', '청소', '미화', '케어',
]

/** 수도권 지역 */
export const METRO_REGIONS = [
  '서울', '경기', '인천',
]

/** 비수도권 지역 (광역시 우선) */
export const NON_METRO_REGIONS = [
  '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

// ── 급여 정규화 ──

/** "월급 2,800,000원 ~ 2,800,000원" → "월 280만원" */
export function normalizeSalary(raw: string | undefined | null): string {
  if (!raw || raw.trim() === '' || raw === '정보 없음') return '급여 협의'

  const cleaned = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim()

  // "월급 2800000원 ~ 2800000원" 또는 "월급 2800000원~3000000원"
  const rangeMatch = cleaned.match(/(\d{4,})원?\s*[~\-]\s*(\d{4,})원?/)
  if (rangeMatch) {
    const low = Math.round(parseInt(rangeMatch[1]) / 10000)
    const high = Math.round(parseInt(rangeMatch[2]) / 10000)
    if (low === high) return `월 ${low}만원`
    return `월 ${low}~${high}만원`
  }

  // "월급 2800000원" 단일
  const singleMatch = cleaned.match(/(\d{4,})원?/)
  if (singleMatch) {
    const amount = Math.round(parseInt(singleMatch[1]) / 10000)
    if (amount >= 100) return `월 ${amount}만원`
    return `시급 ${amount.toLocaleString()}원`
  }

  // "시급 12000원" 또는 "시급 1.2만"
  const hourlyMatch = cleaned.match(/시급\s*(\d[\d,.]*)\s*(만|원)?/)
  if (hourlyMatch) {
    const val = hourlyMatch[1].replace(/,/g, '')
    if (hourlyMatch[2] === '만') return `시급 ${val}만원`
    const num = parseInt(val)
    if (num >= 10000) return `시급 ${(num / 10000).toFixed(1).replace('.0', '')}만원`
    return `시급 ${num.toLocaleString()}원`
  }

  // 이미 "월 200만" 같은 형식이면 그대로
  if (/월\s*\d+만/.test(cleaned)) return cleaned.replace(/원$/, '') + (cleaned.endsWith('원') ? '' : '원')

  return raw.trim()
}

// ── 사용자 표시 태그 생성 (최대 3개) ──

/** 일자리 정보에서 사용자에게 보여줄 태그를 최대 3개 생성 */
export function generateDisplayTags(job: FilteredJob): string[] {
  const tags: string[] = []

  // 1순위: 나이/경력 조건
  const titleLower = (job.title + ' ' + (job.description ?? '')).toLowerCase()
  if (titleLower.includes('나이무관') || titleLower.includes('나이 무관') || titleLower.includes('연령무관')) {
    tags.push('나이무관')
  } else if (titleLower.includes('60대') || titleLower.includes('65세')) {
    tags.push('60대환영')
  } else if (titleLower.includes('50대') || titleLower.includes('시니어')) {
    tags.push('시니어환영')
  }

  // 2순위: 경력/초보
  if (titleLower.includes('초보') || titleLower.includes('경력무관') || titleLower.includes('경력 무관') || titleLower.includes('미경력')) {
    tags.push('초보환영')
  }

  // 3순위: 근무 조건
  if (job.workHours) {
    const hours = job.workHours.toLowerCase()
    if (hours.includes('오전') || /09.*13|09.*12|08.*12/.test(hours)) tags.push('오전근무')
    else if (hours.includes('오후')) tags.push('오후근무')
  }
  if (job.workDays) {
    const days = job.workDays.toLowerCase()
    if (days.includes('주3') || days.includes('주 3')) tags.push('주3일')
    else if (days.includes('주5') || days.includes('주 5') || days.includes('월~금')) tags.push('주5일')
  }

  // 4순위: 고용 형태
  if (job.jobType) {
    if (job.jobType.includes('단기') || job.jobType.includes('일용')) tags.push('단기가능')
    else if (job.jobType.includes('정규')) tags.push('정규직')
  }

  // 야간 없음
  if (titleLower.includes('야간없음') || titleLower.includes('야간 없음') || titleLower.includes('주간')) {
    tags.push('야간없음')
  }

  return tags.slice(0, 3)
}
