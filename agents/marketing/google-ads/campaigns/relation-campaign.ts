/**
 * RELATION 캠페인 설정 — 관계·소속감
 * 욕망 순위 #1 (반응 강도 최고, 평균 15.1점)
 *
 * 전략: "혼자가 아니다" 메시지로 5060 여성 가입 유도
 * 랜딩: age-doesnt-matter.com (홈)
 * 일예산: 10,000원 / 최대 CPC: 2,000원
 */

export interface RSAHeadline {
  text: string          // 최대 30자
  pinPosition?: 1 | 2 | 3  // 고정 위치 (없으면 AI 자동 배치)
}

export interface RSADescription {
  text: string          // 최대 90자
  pinPosition?: 1 | 2
}

export interface KeywordConfig {
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
}

export interface AdGroupConfig {
  adGroupName: string
  maxCpcKrw?: number          // 없으면 캠페인 maxCpcKrw 사용
  keywords: KeywordConfig[]
  headlines: RSAHeadline[]
  descriptions: RSADescription[]
  finalUrl: string
  displayPath: [string, string]
}

export interface CampaignConfig {
  name: string
  desireCode: 'RELATION' | 'HEALTH' | 'RETIRE' | 'MONEY'
  dailyBudgetKrw: number
  maxCpcKrw: number
  landingUrl: string
  adSchedule: {
    startHour: number   // KST (UTC+9)
    endHour: number
  }
  adGroupName: string
  keywords: KeywordConfig[]
  negativeKeywords: string[]
  headlines: RSAHeadline[]
  descriptions: RSADescription[]
  finalUrl: string
  displayPath: [string, string]   // URL 표시 경로 (각 15자 이내)
  /** 복수 광고그룹 모드 — 설정 시 adGroupName/keywords/headlines/descriptions/finalUrl/displayPath 무시 */
  adGroups?: AdGroupConfig[]
}

// ──────────────────────────────────────────────────────────────
// RELATION 캠페인 설정
// ──────────────────────────────────────────────────────────────

export const RELATION_CAMPAIGN: CampaignConfig = {
  name: '우나어_RELATION_관계소속감',
  desireCode: 'RELATION',
  dailyBudgetKrw: 10000,
  maxCpcKrw: 2000,
  landingUrl: 'https://age-doesnt-matter.com',
  adSchedule: {
    startHour: 8,   // 08:00 KST
    endHour: 22,    // 22:00 KST
  },
  adGroupName: '5060_여성_커뮤니티',

  // 핵심 키워드 (구문 일치 우선)
  keywords: [
    { text: '50대 여성 커뮤니티', matchType: 'PHRASE' },
    { text: '5060 모임', matchType: 'PHRASE' },
    { text: '또래 친구 만들기', matchType: 'PHRASE' },
    { text: '중년 여성 커뮤니티', matchType: 'PHRASE' },
    { text: '50대 온라인 모임', matchType: 'PHRASE' },
    { text: '인생 2막 커뮤니티', matchType: 'PHRASE' },
    { text: '오십대 여성 카페', matchType: 'PHRASE' },
    { text: '50대 수다', matchType: 'BROAD' },
    { text: '중년 온라인 카페', matchType: 'BROAD' },
  ],

  // 제외 키워드 (허수 클릭 차단)
  negativeKeywords: [
    '시니어',
    '어르신',
    '노인',
    '요양',
    '취업',
    '구인구직',
    '영어',
    '학원',
    '과외',
  ],

  // 헤드라인 15개 (구글 AI가 최적 조합 자동 선택)
  headlines: [
    { text: '혼자가 아니에요', pinPosition: 1 },        // 고정 1번 — 핵심 메시지
    { text: '우리 또래만의 공간' },
    { text: '말 안 해도 통하는 친구들' },
    { text: '50대 여성 커뮤니티' },
    { text: '같은 나이 같은 고민' },
    { text: '무료로 가입하기' },
    { text: '지금 바로 시작하세요' },
    { text: '우리 나이가 어때서' },
    { text: '5060 여성 수다 공간' },
    { text: '진짜 공감해주는 친구들' },
    { text: '또래 여성들의 아지트' },
    { text: '함께라 든든해요' },
    { text: '이해받는 기분이 달라요' },
    { text: '비슷한 고민 나눠요' },
    { text: '내 나이 친구가 여기 있어요' },
  ],

  // 설명문 4개
  descriptions: [
    {
      text: '같은 나이, 같은 고민. 50대 여성들의 진짜 수다 공간. 지금 무료로 가입하세요.',
      pinPosition: 1,
    },
    {
      text: '갱년기부터 인생 2막까지, 나와 똑같은 고민을 가진 또래 친구들이 기다려요.',
    },
    {
      text: '평가 없는 안전한 공간. 우리 또래끼리만 모인 진짜 커뮤니티.',
    },
    {
      text: '혼자 고민하지 마세요. 먼저 해본 사람들의 솔직한 경험담이 여기 있어요.',
    },
  ],

  finalUrl: 'https://age-doesnt-matter.com',
  displayPath: ['또래커뮤니티', '무료가입'],
}
