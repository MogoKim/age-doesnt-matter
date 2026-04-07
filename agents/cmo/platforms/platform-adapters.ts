/**
 * SNS 플랫폼 어댑터 — 플랫폼별 톤/포맷/해시태그/요일 전략 설정
 *
 * 각 플랫폼의 특성에 맞춘 콘텐츠 생성 가이드를 제공합니다.
 * 이 파일이 플랫폼 전략의 canonical source입니다.
 * (threads-config.ts는 하위 호환용으로 유지)
 */

import type { SocialPlatform } from '../../../src/generated/prisma/client.js'

export interface PlatformAdapter {
  platform: SocialPlatform
  name: string
  maxLength: number
  tone: string
  formatGuide: string
  hashtagStrategy: string
  demographicNotes: string
  dayStrategies: Record<number, string> // 0=Sun...6=Sat
}

export const PLATFORM_ADAPTERS: Record<string, PlatformAdapter> = {
  THREADS: {
    platform: 'THREADS',
    name: 'Threads',
    maxLength: 500,
    tone: '이웃과 수다하듯 자연스러운 반말 대화체. 따뜻하고 친근하게, 150-350자가 공감 스토리 전달에 최적.',
    formatGuide: `- 150-350자 (최대 500자) — 공감 스토리를 충분히 전달할 수 있는 길이
- 첫 줄은 공감형 오프닝: "나만 이런 거 아니지?", "오늘 이런 일이 있었는데", "솔직히 이 나이에...", "요즘 부쩍 그런 생각이 들어"
- 금지 오프닝: "이거 모르면 진짜 손해야", "딱 하나만 기억해" (클릭베이트 — 타겟 미스매치)
- 스토리텔링: 공감 → 반전/인사이트 → 따뜻한 마무리
- 마지막 줄에 질문 1개 의무화: "여러분은 어때요?", "혹시 비슷한 경험 있으신 분?"
- 이모지 1-2개만 자연스럽게`,
    hashtagStrategy: '토픽 태그 정확히 1개만 (#없이 자연스러운 한글 단어. 예: 일상, 건강정보, 꿀팁). 다중 태그는 스팸 처리됨.',
    demographicNotes: '50-60대 한국 사용자. 화~목 오전 7-9시 KST가 최적 시간대. 체류 시간(Dwell Time)이 알고리즘 최대 가중치.',
    dayStrategies: {
      0: '따뜻한 일요일 마무리 — 편안한 감성, 내일을 위한 응원, 주말 여운',
      1: '월요일 동기부여 — 새 주 시작 격려, 일자리/활동 통계, 주간 실용 팁',
      2: '화요일 건강 팁 — 건강 정보, 건강 뉴스, 운동 이야기, 실용 건강 조언',
      3: '수요일 커뮤니티 목소리 — 함께하는 이야기, 커뮤니티 통계, 회원 경험담',
      4: '목요일 실용 정보 — 재테크 팁, 요리 이야기, 생활 정보 깊이 있게',
      5: '금요일 주말 계획 — 주말 추천, 가볍고 유쾌한 콘텐츠, 여가 아이디어',
      6: '토요일 유머/여유 — 주말 읽을거리, 라이프스타일, 커뮤니티 하이라이트',
    },
  },

  X: {
    platform: 'X',
    name: 'X (Twitter)',
    maxLength: 280,
    tone: '뉴스처럼 간결하고 펀치있게. 정보형 톤, 100-140자 타겟 (링크 공간 확보).',
    formatGuide: `- 100-140자 타겟 (최대 280자, 링크 포함 시 공간 확보)
- 핵심 메시지 한 줄로 전달
- 수치/통계 포함 시 설득력 UP
- CTA(클릭 유도) 간결하게`,
    hashtagStrategy: '해시태그 2-3개 (한글). 50대 60대가 검색할 만한 키워드 중심.',
    demographicNotes: '50-60대 정보 탐색형 사용자. 평일 오전 08-10시 KST 최적.',
    dayStrategies: {
      0: '일요일 회고 명언 — 한 주 돌아보는 따뜻한 인용구',
      1: '월요일 뉴스형 — 일자리/활동 통계, 주간 핫이슈 요약',
      2: '화요일 건강 뉴스 — 건강 관련 뉴스 팁, 최신 건강 트렌드',
      3: '수요일 커뮤니티 통계 — 커뮤니티 활동 수치, 인기 글 소개',
      4: '목요일 재테크/생활 팁 — 실용 금융 정보, 절약 팁',
      5: '금요일 주말 추천 — 주말 갈 곳, 할 것 추천',
      6: '토요일 주말 읽기 — 가벼운 읽을거리, 위트 있는 관찰',
    },
  },

  INSTAGRAM: {
    platform: 'INSTAGRAM',
    name: 'Instagram',
    maxLength: 2200,
    tone: '따뜻한 "인생 2막" 감성. 아름답고 영감을 주는 톤, 캡션 150-300자.',
    formatGuide: `- 캡션 150-300자 (카드뉴스/이미지와 함께)
- 첫 2줄이 피드에서 보이므로 핵심 훅 배치
- 줄바꿈으로 가독성 확보
- CTA: "저장해두세요", "태그해주세요" 등 참여 유도
- 카드뉴스 형태가 50-60대에게 효과적`,
    hashtagStrategy: '5-10개 중간 규모 한국어 해시태그. 너무 대중적이지도, 너무 마이너하지도 않은 키워드. 예: #인생2막 #50대일상 #건강한하루',
    demographicNotes: '50-60대 여성 비율 높음. 화/목/토 18-20시 KST 최적. 이미지 품질이 핵심.',
    dayStrategies: {
      0: '일요일 무드 — 편안한 일요일 감성 사진/카드뉴스',
      1: '월요일 롱폼 스토리 — 영감 주는 인생 2막 이야기',
      2: '화요일 운동/건강 릴 — 건강한 라이프스타일 카드뉴스',
      3: '수요일 회원 이야기 캐러셀 — 커뮤니티 멤버 스토리',
      4: '목요일 요리/생활 릴 — 실용적인 정보 카드뉴스',
      5: '금요일 감성 사진 — 아름다운 일상, 주말 기대감',
      6: '토요일 라이프스타일 캐러셀 — 취미/여가/여행 콘텐츠',
    },
  },

  FACEBOOK: {
    platform: 'FACEBOOK',
    name: 'Facebook',
    maxLength: 63206,
    tone: '커뮤니티 나눔형 스토리텔링. 따뜻하고 공감가는 이야기 + 끝에 질문으로 참여 유도. 500-1000자 OK.',
    formatGuide: `- 500-1000자 (긴 글도 OK)
- 스토리텔링 구조: 도입 → 경험/정보 → 질문으로 마무리
- 마지막에 반드시 질문 1개 ("여러분은 어떠세요?" 등)
- 이미지 첨부 시 참여율 2배
- 링크 프리뷰 활용`,
    hashtagStrategy: '해시태그 2-3개만 (Facebook에서는 해시태그 과다 사용 비추). 예: #우리또래 #인생2막',
    demographicNotes: '50-60대 가장 활발한 플랫폼. 평일 저녁 19-21시 KST 최적. 공유/댓글 문화 강함.',
    dayStrategies: {
      0: '일요일 한 주 미리보기 — 다음 주 기대되는 이야기 예고',
      1: '월요일 동기부여 스토리 — 긴 형식 영감 이야기',
      2: '화요일 건강 딥다이브 — 상세한 건강 정보 글',
      3: '수요일 공유 스레드 — "여러분의 이야기를 들려주세요" 참여형',
      4: '목요일 정보 기사형 — 재테크/생활 정보 상세 글',
      5: '금요일 주말 아이디어 — 주말 활동/여행 추천',
      6: '토요일 커뮤니티 하이라이트 — 이번 주 인기 글/활동 정리',
    },
  },

  BAND: {
    platform: 'BAND',
    name: 'Band',
    maxLength: 5000,
    tone: '이웃 모임 톤. 실용적이고 다정한 그룹 대화체. 300-500자.',
    formatGuide: `- 300-500자 (간결하고 실용적)
- 인사 + 본문 + 마무리 구조
- 실용적 정보 위주 (건강, 일자리, 생활 팁)
- 그룹원들에게 말하듯 다정하게
- 이모지 적절히 활용`,
    hashtagStrategy: '해시태그 없음 (Band 문화에서 해시태그 비사용). 키워드는 본문에 자연스럽게 포함.',
    demographicNotes: '50-60대 그룹 활동 중심. 매일 아침 08-09시 KST 최적. 실용 정보에 반응 높음.',
    dayStrategies: {
      0: '일요일 다음 주 준비 — 다음 주 일정/이벤트 안내',
      1: '월요일 주간 일정 — 이번 주 활동/이벤트 안내',
      2: '화요일 건강 그룹 팁 — 함께 실천할 건강 습관',
      3: '수요일 이벤트 리마인더 — 진행 중인 활동/모임 안내',
      4: '목요일 실용 그룹 팁 — 생활/재테크 정보 공유',
      5: '금요일 주말 이벤트 — 주말 모임/활동 안내',
      6: '토요일 그룹 활동 — 함께하는 주말 활동 공유',
    },
  },
}

/**
 * 현재 API 토큰이 설정된 플랫폼의 어댑터만 반환
 */
export function getActiveAdapters(): PlatformAdapter[] {
  return Object.values(PLATFORM_ADAPTERS).filter(a => {
    switch (a.platform) {
      case 'THREADS': return !!process.env.THREADS_ACCESS_TOKEN
      case 'X': return !!process.env.X_BEARER_TOKEN
      case 'INSTAGRAM': return !!process.env.INSTAGRAM_ACCESS_TOKEN
      case 'FACEBOOK': return !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN
      case 'BAND': return !!process.env.BAND_ACCESS_TOKEN
      default: return false
    }
  })
}
