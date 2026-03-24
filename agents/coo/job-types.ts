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
  seoKeywords: string[]    // SEO 키워드 4개
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
