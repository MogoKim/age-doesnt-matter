/**
 * Threads 전략 설정 — 요일별 전략 + 토픽 태그 + 톤 가이드
 *
 * NOTE: 플랫폼별 전략의 canonical source는 `platforms/platform-adapters.ts`로 이전됨.
 * 이 파일은 하위 호환성을 위해 유지합니다. Threads-specific 상세 가이드
 * (THREADS_TONE_GUIDE, DWELL_TIME_GUIDE, DayStrategy 등)는 social-poster.ts에서
 * 여전히 참조하므로 삭제하지 마세요.
 *
 * Threads 한국 트렌드 (2026) 기반:
 * - 토픽 태그 1개만 (다중 = 스팸 처리)
 * - 체류 시간(Dwell Time)이 알고리즘 최대 가중치
 * - 화~목 오전 7-9시, 점심 12-1시가 황금 시간대
 * - 반말 문화 유지 (자연스럽고 따뜻한 반말)
 * - 이미지 포함 시 +60% 인게이지먼트
 */

// ── 톤 가이드 (50-60대 맞춤, 자연스러운 반말) ──

export const THREADS_TONE_GUIDE = `
톤 규칙:
- 자연스럽고 따뜻한 반말 사용 (Threads 문화)
- "야", "너", "니" 같은 격한 반말은 절대 금지
- "~요" 종결도 OK (반말+존댓말 자연 혼용)
- "시니어", "액티브 시니어" 절대 금지 → "우리 또래", "50대 60대", "인생 2막"
- 이모지는 1-2개만 자연스럽게 (남발 금지)
- 정치/종교/혐오 절대 금지
`.trim()

// ── 요일별 전략 ──

export interface DayStrategy {
  dayName: string
  contentTypes: string[]      // 우선 콘텐츠 유형
  preferredPersonas: string[] // 우선 페르소나 ID
  format: string              // 포맷 가이드
  topicTagHint: string        // 토픽 태그 방향
  mood: string                // 요일 분위기
}

const DAY_STRATEGIES: Record<number, DayStrategy> = {
  0: { // 일요일
    dayName: '일요일',
    contentTypes: ['PERSONA', 'HUMOR'],
    preferredPersonas: ['A', 'C'],
    format: '짧은 일상 이야기, 쉬는 날 감성',
    topicTagHint: '일상',
    mood: '편안한 주말 마무리, 내일을 위한 따뜻한 응원',
  },
  1: { // 월요일
    dayName: '월요일',
    contentTypes: ['PERSONA', 'PRACTICAL'],
    preferredPersonas: ['A', 'B'],
    format: '동기부여형, 한 주 시작 응원',
    topicTagHint: '새로운시작',
    mood: '월요일 힘내자는 따뜻한 격려',
  },
  2: { // 화요일
    dayName: '화요일',
    contentTypes: ['COMMUNITY', 'PRACTICAL', 'MAGAZINE'],
    preferredPersonas: ['B', 'H'],
    format: '실용 정보, 질문형 참여 유도',
    topicTagHint: '생활정보',
    mood: '실용적이고 유익한 정보 전달',
  },
  3: { // 수요일
    dayName: '수요일',
    contentTypes: ['COMMUNITY', 'JOB_ALERT', 'PRACTICAL'],
    preferredPersonas: ['B', 'H'],
    format: '정보형, 리스트형, 팁 공유',
    topicTagHint: '꿀팁',
    mood: '주중 알짜 정보와 일자리 소식',
  },
  4: { // 목요일
    dayName: '목요일',
    contentTypes: ['MAGAZINE', 'COMMUNITY', 'PRACTICAL'],
    preferredPersonas: ['A', 'B'],
    format: '스토리텔링, 경험담 공유',
    topicTagHint: '인생이야기',
    mood: '깊이 있는 이야기와 공감',
  },
  5: { // 금요일
    dayName: '금요일',
    contentTypes: ['HUMOR', 'PERSONA', 'COMMUNITY'],
    preferredPersonas: ['C', 'A'],
    format: '가볍고 유쾌한 콘텐츠, 주말 기대감',
    topicTagHint: '금요일',
    mood: '한 주 수고했다는 위로와 유머',
  },
  6: { // 토요일
    dayName: '토요일',
    contentTypes: ['PERSONA', 'HUMOR', 'MAGAZINE'],
    preferredPersonas: ['A', 'C'],
    format: '여가/라이프스타일, 가벼운 읽을거리',
    topicTagHint: '주말',
    mood: '여유로운 주말, 취미와 여가',
  },
}

export function getDayStrategy(date: Date = new Date()): DayStrategy {
  const kstHour = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return DAY_STRATEGIES[kstHour.getDay()]
}

// ── 토픽 태그 매핑 (콘텐츠 유형 → 1개만) ──

const TOPIC_TAG_MAP: Record<string, string[]> = {
  PERSONA: ['일상', '오늘하루', '인생2막', '50대일상'],
  COMMUNITY: ['커뮤니티', '함께해요', '우리또래', '동네이야기'],
  JOB_ALERT: ['일자리', '채용정보', '시니어채용', '재취업'],
  MAGAZINE: ['읽을거리', '매거진', '인생이야기', '에세이'],
  HUMOR: ['웃음', '유머', '일상유머', '오늘의웃음'],
  PRACTICAL: ['생활정보', '꿀팁', '건강정보', '알아두면좋은것'],
  NOSTALGIA: ['추억', '그때그시절', '옛날이야기'],
}

/** 콘텐츠 유형에 맞는 토픽 태그 1개 반환 (랜덤 선택) */
export function getTopicTag(contentType: string): string {
  const tags = TOPIC_TAG_MAP[contentType] ?? TOPIC_TAG_MAP['PERSONA']
  return tags[Math.floor(Math.random() * tags.length)]
}

// ── 체류 시간 최적화 오프닝 템플릿 ──

export const DWELL_TIME_GUIDE = `
체류 시간 최적화 (Threads 알고리즘 핵심):
- 첫 줄은 반드시 호기심을 자극하는 오프닝
- 예시: "이거 모르면 진짜 손해야", "딱 하나만 기억해", "솔직히 나도 몰랐는데"
- 스토리텔링 구조: 공감 → 반전/인사이트 → 따뜻한 마무리
- 끝까지 읽고 싶게 만드는 게 최우선
- 결론을 첫 줄에 쓰지 마 — 궁금하게 만들어야 스크롤을 멈춤
`.trim()

// ── 이미지 포함 확률 (콘텐츠 유형별) ──

export const IMAGE_INCLUDE_RATE: Record<string, number> = {
  MAGAZINE: 0.9,
  JOB_ALERT: 0.8,
  COMMUNITY: 0.7,
  PRACTICAL: 0.6,
  HUMOR: 0.5,
  PERSONA: 0.4,
  NOSTALGIA: 0.6,
}

// ── 게시 시간 슬롯 ──

export function detectOptimalSlot(): 'earlyMorning' | 'lunch' | 'afternoon' | 'evening' {
  const kstStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })
  const h = parseInt(kstStr, 10)
  if (h >= 6 && h < 10) return 'earlyMorning'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 14 && h < 18) return 'afternoon'
  return 'evening'
}
