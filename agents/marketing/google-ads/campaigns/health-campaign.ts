/**
 * HEALTH 캠페인 설정 — 건강 염려·악화 공포 (v4.0 재정의 2026-04-15)
 * 욕망 순위 #4 (글 수 최다 85건, 반응 강도는 낮음)
 *
 * [v4.0 핵심 재정의]
 * ❌ 구 정의: "건강 개선·효능감" — 적극적으로 몸을 개선하고 싶다
 * ✅ 신 정의: "건강 염려·악화 공포·현상 유지" — 지금보다 더 나빠지지 않았으면
 *
 * 욕망 3층 구조:
 *   Layer 1 (표면) — 정보 욕구: "이 증상이 뭔지", "어느 병원 가야 해"
 *   Layer 2 (중간) — 공감 욕구: "나만 이런 거 아니야", "같은 경험한 사람 있으면"
 *   Layer 3 (핵심) — 위로 욕구: "괜찮다고 해줬으면", "혼자 감당하는 게 아니라는 확인"
 *   → Layer 3는 RELATION 욕망과 연결됨. 건강 염려 뒤엔 항상 고립감이 있다.
 *
 * 광고 메시지 원칙: "정보 제공"이 아닌 "나만 이런 거 아니야" 공감 경험으로 연결
 * 랜딩: age-doesnt-matter.com/magazine (갱년기 매거진)
 * 일예산: 10,000원 / 최대 CPC: 2,000원
 */

import type { CampaignConfig } from './relation-campaign.js'

export const HEALTH_CAMPAIGN: CampaignConfig = {
  name: '우나어_HEALTH_건강갱년기',
  desireCode: 'HEALTH',
  dailyBudgetKrw: 10000,
  maxCpcKrw: 2000,
  landingUrl: 'https://age-doesnt-matter.com/magazine',
  adSchedule: {
    startHour: 8,
    endHour: 22,
  },
  adGroupName: '갱년기_건강_커뮤니티',

  // 갱년기·건강 관련 검색 키워드
  keywords: [
    { text: '갱년기 증상', matchType: 'PHRASE' },
    { text: '갱년기 커뮤니티', matchType: 'PHRASE' },
    { text: '50대 건강 정보', matchType: 'PHRASE' },
    { text: '갱년기 경험', matchType: 'PHRASE' },
    { text: '중년 건강 고민', matchType: 'PHRASE' },
    { text: '갱년기 극복', matchType: 'PHRASE' },
    { text: '50대 건강 커뮤니티', matchType: 'PHRASE' },
    { text: '갱년기 정보', matchType: 'BROAD' },
    { text: '중년 여성 건강', matchType: 'BROAD' },
    { text: '갱년기 이야기', matchType: 'BROAD' },
  ],

  // 병원·처방 검색은 제외 (전환 의도 다름)
  negativeKeywords: [
    '병원 예약',
    '의사 상담',
    '약 처방',
    '치료',
    '클리닉',
    '한의원 예약',
    '내과',
    '산부인과',
    '시술',
    '보험',
  ],

  headlines: [
    { text: '나만 이런 줄 알았어', pinPosition: 1 },
    { text: '또래 경험담이 제일 도움돼' },
    { text: '갱년기 우리끼리 얘기해요' },
    { text: '50대 건강 정보 커뮤니티' },
    { text: '갱년기, 혼자 걱정 마세요' },
    { text: '우리 나이가 어때서' },
    { text: '같은 증상 먼저 해본 사람' },
    { text: '갱년기 솔직 경험담 모음' },
    { text: '또래한테 물어보세요' },
    { text: '무료로 가입하기' },
    { text: '지금 바로 확인하기' },
    { text: '공감받는 건강 이야기' },
    { text: '내 증상 나만 아닌 거였어' },
    { text: '5060 여성 건강 커뮤니티' },
    { text: '함께라 덜 무서워요' },
  ],

  descriptions: [
    {
      text: '갱년기 증상, 혼자 걱정 말고 같은 나이 친구들한테 물어보세요. 무료 가입.',
      pinPosition: 1,
    },
    {
      text: '나만 이런 줄 알았는데 다들 비슷하더라고요. 50대 여성들의 솔직한 건강 이야기.',
    },
    {
      text: '갱년기부터 건강 루틴까지, 또래 경험담이 의사 말보다 더 와닿을 때가 있어요.',
    },
    {
      text: '병원 가기 전에 먼저 같은 나이 친구들 경험 들어보세요. 우나어 무료 커뮤니티.',
    },
  ],

  finalUrl: 'https://age-doesnt-matter.com/magazine',
  displayPath: ['갱년기정보', '또래경험담'],
}
