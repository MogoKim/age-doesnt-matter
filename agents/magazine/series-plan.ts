/**
 * 2026년 매거진 연간 시리즈 계획
 * 48개 시리즈 × 5편 = 240편 예약 콘텐츠
 * 1일 3편 × 365일 = 최대 1,095편 — 시리즈 240편 + 트렌드 855편
 *
 * 사용법: magazine-generator.ts에서 오늘 날짜 기준으로 조회
 */

export interface SeriesPlan {
  seriesId: string        // 고유 식별자 (DB seriesId)
  category: string        // 매거진 카테고리
  title: string           // 시리즈 제목
  description: string     // 시리즈 설명
  topics: string[]        // 각 편 주제 (순서대로)
  startWeek: number       // 시작 주차 (1~52)
  interval: 'weekly' | 'biweekly'  // 발행 간격
  seasonId: string        // 분기 태깅 (2026-Q1 등)
}

/** 오늘 날짜가 몇 번째 주인지 계산 */
export function getWeekNumber(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  return Math.ceil(diff / oneWeek)
}

/** 오늘 날짜 기준으로 진행 중인 시리즈 + 현재 편 번호 조회 */
export function getActiveSeriesToday(date: Date = new Date()): Array<{
  series: SeriesPlan
  episodeIndex: number  // 0-based
  episodeTitle: string
}> {
  const week = getWeekNumber(date)
  const results: Array<{ series: SeriesPlan; episodeIndex: number; episodeTitle: string }> = []

  for (const series of ANNUAL_SERIES_2026) {
    const weeksElapsed = week - series.startWeek
    if (weeksElapsed < 0) continue  // 아직 시작 안 됨

    const step = series.interval === 'weekly' ? 1 : 2
    const episodeIndex = Math.floor(weeksElapsed / step)

    if (episodeIndex >= series.topics.length) continue  // 완료된 시리즈

    // 해당 주 시작일에만 발행 (weekly: 매주 월요일, biweekly: 격주 월요일)
    const dayOfWeek = date.getDay()  // 0=일, 1=월
    const isPublishDay = dayOfWeek === 1  // 월요일

    if (!isPublishDay) continue

    results.push({
      series,
      episodeIndex,
      episodeTitle: series.topics[episodeIndex],
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// 2026년 연간 시리즈 48개
// ---------------------------------------------------------------------------

export const ANNUAL_SERIES_2026: SeriesPlan[] = [

  // ── Q1 (1~3월) ────────────────────────────────────────────────────────

  {
    seriesId: '2026-q1-health-menopause',
    category: '건강',
    title: '50대 갱년기 완벽 가이드',
    description: '갱년기부터 완경까지, 단계별 대처법',
    seasonId: '2026-Q1',
    startWeek: 1,
    interval: 'weekly',
    topics: [
      '갱년기란 무엇인가 — 시작 시기와 전조 증상',
      '안면홍조·수면장애, 이렇게 관리해요',
      '갱년기와 골다공증 — 뼈 건강 지키는 법',
      '호르몬 치료, 받아야 할까요?',
      '완경 후 달라지는 몸, 이것만 알면 돼요',
    ],
  },
  {
    seriesId: '2026-q1-money-pension',
    category: '재테크',
    title: '국민연금 완전 정복',
    description: '수령 시기부터 임의계속가입까지, 국민연금 A to Z',
    seasonId: '2026-Q1',
    startWeek: 3,
    interval: 'weekly',
    topics: [
      '국민연금, 언제 받는 게 이득일까요',
      '임의계속가입으로 더 받는 법',
      '조기 수령 vs 연기 수령 — 시뮬레이션',
      '국민연금과 퇴직연금 함께 받는 법',
      '연금 수령 중 일하면 어떻게 되나요',
    ],
  },
  {
    seriesId: '2026-q1-relation-friendship',
    category: '관계',
    title: '중년에 진짜 친구 만들기',
    description: '50대 이후 인간관계를 새로 시작하는 법',
    seasonId: '2026-Q1',
    startWeek: 7,
    interval: 'weekly',
    topics: [
      '50대에 친구가 사라지는 이유',
      '새 친구 사귀는 현실적인 방법 3가지',
      '동네 커뮤니티 활용하기',
      '온라인으로 우리 또래 연결하기',
      '느슨한 연결이 외로움을 줄여준다',
    ],
  },
  {
    seriesId: '2026-q1-cooking-basics',
    category: '요리',
    title: '50대 건강 식단 기본기',
    description: '갱년기·관절·혈압을 고려한 식재료 활용법',
    seasonId: '2026-Q1',
    startWeek: 5,
    interval: 'weekly',
    topics: [
      '갱년기에 특히 챙겨야 할 영양소 5가지',
      '혈압 관리에 좋은 밑반찬 4가지',
      '관절에 좋은 식재료, 매일 먹는 법',
      '혼밥 요리 — 영양 있게 간편하게',
      '건강한 냉장고 만들기 — 장보기 전략',
    ],
  },

  // ── Q2 (4~6월) ────────────────────────────────────────────────────────

  {
    seriesId: '2026-q2-retire-life2',
    category: '은퇴준비',
    title: '퇴직 후 6개월 생존 가이드',
    description: '퇴직 첫 날부터 6개월까지, 현실적인 준비 로드맵',
    seasonId: '2026-Q2',
    startWeek: 14,
    interval: 'weekly',
    topics: [
      '퇴직 첫 달 — 반드시 해야 할 행정 처리',
      '건강보험 지역가입 전환, 이렇게 줄이세요',
      '퇴직금 어디에 넣을까 — IRP vs 연금저축',
      '퇴직 후 시간 관리 — 루틴 만드는 법',
      '인생 2막, 지금 시작해도 늦지 않아요',
    ],
  },
  {
    seriesId: '2026-q2-job-reemployment',
    category: '일자리',
    title: '50대 재취업 성공 스토리',
    description: '나이 무관 채용 공고 찾기부터 면접까지',
    seasonId: '2026-Q2',
    startWeek: 18,
    interval: 'weekly',
    topics: [
      '나이 무관 채용, 어디서 찾나요',
      '50대 재취업 성공한 분들의 공통점',
      '이력서·자기소개서 50대 버전으로 쓰는 법',
      '면접에서 이렇게 말했더니 합격했어요',
      '재취업 후 직장 적응하는 법',
    ],
  },
  {
    seriesId: '2026-q2-home-reorganize',
    category: '집꾸미기',
    title: '자녀 떠난 집, 나만의 공간 만들기',
    description: '빈 방을 내 취미·쉼터로 바꾸는 아이디어',
    seasonId: '2026-Q2',
    startWeek: 22,
    interval: 'weekly',
    topics: [
      '빈방 활용 아이디어 5가지',
      '거실을 내 취미실로 바꾸는 법',
      '주방 정리·수납, 이렇게 하니 편해요',
      '50대 인테리어 — 예산 없이 분위기 바꾸기',
      '베란다 텃밭, 작은 것부터 시작해요',
    ],
  },
  {
    seriesId: '2026-q2-health-checkup',
    category: '건강',
    title: '50대 필수 건강검진 완전 정복',
    description: '어떤 검진을 언제 받아야 하는지 총정리',
    seasonId: '2026-Q2',
    startWeek: 16,
    interval: 'weekly',
    topics: [
      '50대에 꼭 받아야 할 건강검진 항목 총정리',
      '국가건강검진 vs 종합검진 — 무엇을 선택할까요',
      '대장내시경, 언제 처음 받아야 하나요',
      '갑상선·자궁경부암 검사, 이렇게 준비해요',
      '검진 결과 "이상" 나왔을 때 어떻게 해야 하나요',
    ],
  },

  // ── Q3 (7~9월) ────────────────────────────────────────────────────────

  {
    seriesId: '2026-q3-health-joints',
    category: '건강',
    title: '50대 무릎·관절 완전 가이드',
    description: '통증 원인부터 수술 결정까지, 관절 건강 총정리',
    seasonId: '2026-Q3',
    startWeek: 27,
    interval: 'weekly',
    topics: [
      '무릎 통증, 어느 병원 가야 하나요',
      '관절에 좋은 음식 TOP 7',
      '관절염 예방 운동 — 무리 없이 하는 법',
      '무릎 보호대, 언제 어떻게 써요',
      '인공관절, 꼭 해야 할까요',
    ],
  },
  {
    seriesId: '2026-q3-travel-korea',
    category: '여행',
    title: '우리 또래 국내여행 추천 시리즈',
    description: '무릎 걱정 없는, 우리 나이 맞춤 국내 여행지',
    seasonId: '2026-Q3',
    startWeek: 31,
    interval: 'weekly',
    topics: [
      '전주 한옥마을, 우리 또래 맞춤 2박3일',
      '경주 한 바퀴 — 걷기 편한 코스만',
      '통영·남해, 남도 해안길의 매력',
      '춘천·강릉 기차 여행',
      '혼자 떠나도 외롭지 않은 제주 여행',
    ],
  },
  {
    seriesId: '2026-q3-cooking-seasonal',
    category: '요리',
    title: '여름 건강 반찬 시리즈',
    description: '더위에 지치지 않는 여름 건강 식단',
    seasonId: '2026-Q3',
    startWeek: 35,
    interval: 'weekly',
    topics: [
      '여름 더위에 기운 나는 음식 5가지',
      '갱년기에 좋은 여름 채소 활용법',
      '냉장고 파먹기 — 2인분 요리 노하우',
      '손녀딸이 좋아하는 건강 레시피',
      '여름 밑반찬 한번에 만들기',
    ],
  },
  {
    seriesId: '2026-q3-relation-family',
    category: '관계',
    title: '가족 관계, 솔직하게 이야기해요 (여름편)',
    description: '자녀 독립 후 달라진 가족 관계, 어떻게 풀어갈까요',
    seasonId: '2026-Q3',
    startWeek: 29,
    interval: 'weekly',
    topics: [
      '자녀 결혼 후, 며느리·사위와 잘 지내는 법',
      '남편 퇴직 후 24시간 함께 — 어떻게 지내세요',
      '노부모 돌봄 — 형제자매 역할 분담',
      '빈 둥지 증후군, 이렇게 극복했어요',
      '황혼이혼 생각해봤어요 — 솔직한 이야기',
    ],
  },

  // ── Q4 (10~12월) ──────────────────────────────────────────────────────

  {
    seriesId: '2026-q4-fashion-winter',
    category: '패션',
    title: '50대 가을·겨울 스타일링',
    description: '나이 들수록 잘 어울리는 색깔과 스타일',
    seasonId: '2026-Q4',
    startWeek: 40,
    interval: 'weekly',
    topics: [
      '50대 이후 잘 어울리는 색깔이 따로 있어요',
      '가을 아우터 — 이 스타일이 가장 세련돼요',
      '흰머리 자연스럽게 커버하는 염색법',
      '중년 여성 피부, 이 루틴으로 달라졌어요',
      '겨울 코디 — 따뜻하면서 멋있게',
    ],
  },
  {
    seriesId: '2026-q4-money-yearend',
    category: '재테크',
    title: '연말 노후 준비 점검',
    description: '올해 안에 꼭 해야 할 재무 체크리스트',
    seasonId: '2026-Q4',
    startWeek: 48,
    interval: 'weekly',
    topics: [
      '올해 노후 준비 체크리스트',
      '연금저축 세액공제 막차 타기',
      '내년 국민건강보험료 미리 계산하기',
      '50대 자산 점검 — 지금 어디쯤 왔을까요',
      '2027년, 내 인생 2막 목표 세우기',
    ],
  },
  {
    seriesId: '2026-q4-hobby-winter',
    category: '취미',
    title: '겨울에 시작하는 실내 취미',
    description: '집에서 즐기는 창의적인 취미 5가지',
    seasonId: '2026-Q4',
    startWeek: 44,
    interval: 'weekly',
    topics: [
      '50대에 수채화 시작했어요 — 6개월 후기',
      '독서모임 만들었어요 — 이렇게 시작했어요',
      '뜨개질, 처음인데 이렇게 배웠어요',
      '요가 vs 필라테스 — 우리 몸엔 뭐가 더 좋을까요',
      '동네 노래교실, 처음엔 창피했는데 지금은',
    ],
  },
  {
    seriesId: '2026-q4-retire-meaning',
    category: '은퇴준비',
    title: '은퇴 후 의미 있는 일 찾기',
    description: '돈보다 중요한 것, 은퇴 후 삶의 목적',
    seasonId: '2026-Q4',
    startWeek: 42,
    interval: 'weekly',
    topics: [
      '퇴직 후 "뭘 해야 하나" 막막할 때',
      '봉사활동으로 새 삶의 의미를 찾은 이야기',
      '배움을 멈추지 않는 50대 — 평생교육 활용법',
      '소규모 창업, 이렇게 시작해보세요',
      '인생 2막에서 찾은 나만의 루틴',
    ],
  },
]
