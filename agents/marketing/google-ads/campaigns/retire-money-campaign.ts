/**
 * RETIRE + MONEY 캠페인 설정 — 4개 광고그룹 SA 전략
 *
 * 그룹1: 공허감/변화 상황 — 빈둥지·퇴직 검색자
 * 그룹2: 커뮤니티 대안 — 50대 모임/카페 검색자
 * 그룹3: 욕망/자존감 — 일자리·인생2막 검색자
 * 그룹4: 정보/실용 — 건강·취미·여행 검색자
 *
 * 일예산: 10,000원 (4그룹 공유)
 * 랜딩: https://www.age-doesnt-matter.com/ (홈)
 */

import type { CampaignConfig } from './relation-campaign.js'

// 공통 설명문 (4개 광고그룹 공유)
const SHARED_DESCRIPTIONS = [
  {
    text: '남편 은퇴 걱정인 분들 모여요. 50·60대 공감 커뮤니티 우리 나이가 어때서.',
    pinPosition: 1 as const,
  },
  {
    text: '나만 이런 줄 알았는데 여기 다 있었어요. 인생 2막을 함께 준비하는 따뜻한 공간.',
  },
  {
    text: '우리 또래가 직접 검증한 정보만 모았습니다. 지금 무료로 시작하세요.',
  },
  {
    text: '같은 고민 가진 분들 바로 만날 수 있어요. 50·60대가 함께하는 커뮤니티.',
  },
]

export const RETIRE_MONEY_CAMPAIGN: CampaignConfig = {
  name: '우나어_RETIRE_MONEY_SA',
  desireCode: 'RETIRE',
  dailyBudgetKrw: 10000,
  maxCpcKrw: 500,
  landingUrl: 'https://www.age-doesnt-matter.com/',
  adSchedule: {
    startHour: 8,
    endHour: 22,
  },

  // 공통 제외 키워드
  negativeKeywords: [
    '취업 사이트',
    '구인구직',
    '헤드헌터',
    '이직',
    '채용',
    '부동산 투자',
    '주식 강의',
    '코인',
    '펀드 가입',
    '시니어',
    '노인',
    '요양',
  ],

  // 단일 광고그룹 호환용 (adGroups 사용 시 무시됨)
  adGroupName: '공허감',
  keywords: [],
  headlines: [],
  descriptions: [],
  finalUrl: 'https://www.age-doesnt-matter.com/',
  displayPath: ['우나어', '무료가입'],

  // ── 4개 광고그룹 ──
  adGroups: [
    {
      // ── 그룹1: 공허감/변화 상황 ──
      adGroupName: '공허감_변화상황',
      maxCpcKrw: 500,
      keywords: [
        { text: '빈둥지 증후군', matchType: 'PHRASE' },
        { text: '남편 퇴직 후 생활', matchType: 'PHRASE' },
        { text: '갱년기 이후 삶', matchType: 'PHRASE' },
        { text: '자녀 결혼 후 허전함', matchType: 'PHRASE' },
        { text: '중년 이후 삶', matchType: 'BROAD' },
        { text: '갱년기 우울', matchType: 'BROAD' },
      ],
      headlines: [
        { text: '남편 퇴직 후 어떻게 사세요', pinPosition: 1 },
        { text: '아이 독립 후 하루가 길어졌어요' },
        { text: '갱년기 지나고 뭔가 달라졌나요' },
        { text: '자녀 결혼 후 집이 조용해졌을 때' },
        { text: '중년 이후 삶 다시 시작하는 분들' },
        { text: '우리 나이가 어때서' },
        { text: '무료로 가입하기' },
        { text: '50대 60대 공감 커뮤니티' },
        { text: '같은 고민 여기 다 있어요' },
        { text: '인생 2막 함께 시작해요' },
      ],
      descriptions: SHARED_DESCRIPTIONS,
      finalUrl: 'https://www.age-doesnt-matter.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire_money_sa&utm_content=empty_nest',
      displayPath: ['우나어', '공감커뮤니티'],
    },
    {
      // ── 그룹2: 커뮤니티 대안 ──
      adGroupName: '커뮤니티_대안',
      maxCpcKrw: 400,
      keywords: [
        { text: '50대 커뮤니티', matchType: 'PHRASE' },
        { text: '60대 커뮤니티', matchType: 'PHRASE' },
        { text: '중장년 카페', matchType: 'PHRASE' },
        { text: '중년 여성 모임', matchType: 'PHRASE' },
        { text: '중장년 커뮤니티', matchType: 'BROAD' },
        { text: '50대 온라인 모임', matchType: 'BROAD' },
      ],
      headlines: [
        { text: '50대 커뮤니티 무료 가입', pinPosition: 1 },
        { text: '중장년 전용 커뮤니티 우나어' },
        { text: '50대 60대만 모인 온라인 모임' },
        { text: '네이버 카페 말고 우리만의 공간' },
        { text: '중년 여성 모임 지금 바로 참여' },
        { text: '우리 나이가 어때서' },
        { text: '무료로 가입하기' },
        { text: '같은 고민 여기 다 있어요' },
        { text: '50대 60대 공감 커뮤니티' },
        { text: '인생 2막 함께 시작해요' },
      ],
      descriptions: SHARED_DESCRIPTIONS,
      finalUrl: 'https://www.age-doesnt-matter.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire_money_sa&utm_content=community',
      displayPath: ['우나어', '무료가입'],
    },
    {
      // ── 그룹3: 욕망/자존감 ──
      adGroupName: '욕망_자존감',
      maxCpcKrw: 600,
      keywords: [
        { text: '50대 일자리', matchType: 'PHRASE' },
        { text: '60대 할 수 있는 일', matchType: 'PHRASE' },
        { text: '50대 여성 취업', matchType: 'PHRASE' },
        { text: '중장년 일자리', matchType: 'PHRASE' },
        { text: '인생 2막 준비', matchType: 'BROAD' },
        { text: '50대 자격증', matchType: 'BROAD' },
      ],
      headlines: [
        { text: '50대 여성 일자리 정보 모음', pinPosition: 1 },
        { text: '60대도 할 수 있는 일 여기 있어요' },
        { text: '인생 2막 시작하는 분들 모여요' },
        { text: '50대 자격증 취업 정보 커뮤니티' },
        { text: '중장년 일자리 커뮤니티 무료 가입' },
        { text: '우리 나이가 어때서' },
        { text: '무료로 가입하기' },
        { text: '50대 60대 공감 커뮤니티' },
        { text: '같은 고민 여기 다 있어요' },
        { text: '또래 경험담이 제일 솔직합니다' },
      ],
      descriptions: SHARED_DESCRIPTIONS,
      finalUrl: 'https://www.age-doesnt-matter.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire_money_sa&utm_content=job_life2',
      displayPath: ['우나어', '일자리정보'],
    },
    {
      // ── 그룹4: 정보/실용 ──
      adGroupName: '정보_실용',
      maxCpcKrw: 400,
      keywords: [
        { text: '50대 건강 관리', matchType: 'PHRASE' },
        { text: '60대 취미', matchType: 'PHRASE' },
        { text: '50대 여행', matchType: 'PHRASE' },
        { text: '갱년기 증상', matchType: 'PHRASE' },
        { text: '중년 다이어트', matchType: 'BROAD' },
        { text: '50대 건강', matchType: 'BROAD' },
      ],
      headlines: [
        { text: '50대 건강 우리끼리 모음', pinPosition: 1 },
        { text: '60대 취미 같이 찾는 커뮤니티' },
        { text: '중년 다이어트 솔직 후기' },
        { text: '50대 여행 직접 올린 후기' },
        { text: '갱년기 지나신 분들 여기 모여요' },
        { text: '우리 나이가 어때서' },
        { text: '무료로 가입하기' },
        { text: '50대 60대 공감 커뮤니티' },
        { text: '같은 고민 여기 다 있어요' },
        { text: '또래 경험담이 제일 솔직합니다' },
      ],
      descriptions: SHARED_DESCRIPTIONS,
      finalUrl: 'https://www.age-doesnt-matter.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire_money_sa&utm_content=info',
      displayPath: ['우나어', '건강정보'],
    },
  ],
}
