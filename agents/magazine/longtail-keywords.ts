/**
 * 롱테일 키워드 사전 — DA 1 신규 도메인의 단기 자연유입 전략
 *
 * 선정 기준:
 * - 검색볼륨: 낮음 (월 100~500회) — DA 90+ 경쟁자가 관심 없는 틈새
 * - 경쟁도: Zero~낮음 — 병원/언론사/공공기관이 타겟하지 않는 구체적 질문
 * - 검색 의도: 명확한 정보 요구 (질문형·비교형·상황형)
 * - 타겟: 50·60대가 AI(ChatGPT/Gemini)나 Google에 실제로 치는 검색어
 *
 * 카테고리별 매핑은 DESIRE_TO_CATEGORY (prompt.ts) 기준
 */

export interface LongtailKeyword {
  keyword: string
  intent: '질문형' | '비교형' | '상황형' | '절세형' | '계산형' | '방법형'
  pillar?: string  // 이 키워드가 속한 토픽 클러스터 필라 제목
}

export const LONGTAIL_KEYWORDS: Record<string, LongtailKeyword[]> = {
  건강: [
    { keyword: '50대 여성 밤에 식은땀 나는 이유', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '갱년기 수면 장애 새벽 3시 깨는 이유', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '갱년기 무릎 통증 운동하면 낫나요', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '갱년기 두근거림 심장 이상인가요', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '갱년기 우울감 혼자 극복하는 법', intent: '방법형', pillar: '갱년기 완전 정복' },
    { keyword: '갱년기 살찌는 이유 뱃살 왜 생기나', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '60대 당뇨 아침 혈당 높은 이유', intent: '질문형' },
    { keyword: '50대 혈압약 먹기 시작할 때 알아야 할 것', intent: '상황형' },
    { keyword: '갱년기 질건조증 불편할 때 어떻게 하나요', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '50대 골다공증 검사 얼마나 자주 해야 하나', intent: '계산형' },
    { keyword: '갱년기 호르몬 치료 받아도 되나요 부작용', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '50대 걷기 운동 하루 몇 분이 적당한가', intent: '계산형' },
    { keyword: '60대 무릎 연골 닳았을 때 수술 vs 물리치료', intent: '비교형' },
    { keyword: '갱년기 시작 나이 평균 언제부터인가요', intent: '질문형', pillar: '갱년기 완전 정복' },
    { keyword: '50대 건강검진 꼭 받아야 할 항목 2026년', intent: '방법형' },
    { keyword: '갱년기 이후 다이어트 잘 안 되는 이유', intent: '질문형', pillar: '갱년기 완전 정복' },
  ],

  재테크: [
    { keyword: '퇴직금 IRP 넣으면 세금 얼마나 아끼나', intent: '절세형', pillar: '퇴직 후 돈 관리' },
    { keyword: '국민연금 조기수령 65세 vs 60세 득실 비교', intent: '비교형', pillar: '기초연금 국민연금 완전 정복' },
    { keyword: '국민연금 늦게 받으면 얼마나 더 받나 계산법', intent: '계산형', pillar: '기초연금 국민연금 완전 정복' },
    { keyword: '퇴직 후 건강보험 지역가입자 얼마나 나오나', intent: '계산형', pillar: '퇴직 후 돈 관리' },
    { keyword: '60대 이상 금융상품 원금 보장 되는 것 추천', intent: '방법형' },
    { keyword: '연금저축 IRP 무엇이 다른가요 차이점', intent: '비교형', pillar: '퇴직 후 돈 관리' },
    { keyword: '퇴직연금 중도인출 가능한 경우 어떤 경우', intent: '질문형', pillar: '퇴직 후 돈 관리' },
    { keyword: '50대 주식 시작해도 되나요 투자 방법', intent: '방법형' },
    { keyword: '노후 생활비 월 300만원으로 가능한가요', intent: '계산형', pillar: '퇴직 후 돈 관리' },
    { keyword: '퇴직금 일시금 vs 연금 어느 게 유리한가', intent: '비교형', pillar: '퇴직 후 돈 관리' },
    { keyword: '60대 부동산 팔아야 하나 계속 가져가야 하나', intent: '비교형' },
    { keyword: '부부 각자 국민연금 받을 수 있나요', intent: '질문형', pillar: '기초연금 국민연금 완전 정복' },
  ],

  은퇴준비: [
    { keyword: '퇴직 후 첫 한 달 어떻게 보내야 하나요', intent: '상황형', pillar: '퇴직 후 돈 관리' },
    { keyword: '은퇴 후 외로움 정상인가요 극복하는 법', intent: '질문형' },
    { keyword: '남편 퇴직 후 24시간 같이 있어서 힘들어요', intent: '상황형' },
    { keyword: '50대 후반 지금 퇴직하면 너무 이른가요', intent: '질문형' },
    { keyword: '퇴직 후 건강보험 임의계속가입 신청 방법', intent: '방법형', pillar: '퇴직 후 돈 관리' },
    { keyword: '60대 봉사활동 시작하는 법 어디서 찾나요', intent: '방법형' },
    { keyword: '은퇴 후 의미 있는 일 찾는 현실적 방법', intent: '방법형' },
    { keyword: '50대 퇴직 후 우울증 생길 수 있나요', intent: '질문형' },
    { keyword: '인생 2막 준비 50대에 시작해도 늦지 않은 것', intent: '방법형' },
    { keyword: '퇴직 후 배우자와 갑자기 많이 싸우는 이유', intent: '질문형' },
  ],

  관계: [
    { keyword: '자녀 독립 후 허전함 빈 둥지 증후군 극복법', intent: '방법형' },
    { keyword: '60대 혼자 사는 여성 외로움 달래는 방법', intent: '방법형' },
    { keyword: '중년에 새 친구 사귀는 현실적 방법', intent: '방법형' },
    { keyword: '50대 이후 관계 정리하고 싶을 때 어떻게', intent: '상황형' },
    { keyword: '자녀 결혼 후 며느리와 잘 지내는 법', intent: '방법형' },
    { keyword: '황혼이혼 생각이 드는 이유 어떻게 해야 하나', intent: '질문형' },
    { keyword: '50대 남성 친구가 없어요 어떻게 만드나요', intent: '질문형' },
    { keyword: '빈 둥지 증후군 남편도 겪을 수 있나요', intent: '질문형' },
  ],

  일자리: [
    { keyword: '나이 무관 채용 공고 어디서 찾나요 50대', intent: '방법형' },
    { keyword: '50대 재취업 성공한 사람들의 공통점', intent: '방법형' },
    { keyword: '노인일자리사업 신청 자격 나이 몇 살부터', intent: '질문형' },
    { keyword: '중장년 취업 자격증 취득 비용 지원 받는 법', intent: '방법형' },
    { keyword: '60대 파트타임 일자리 쉽게 구하는 방법', intent: '방법형' },
    { keyword: '50대 창업 성공률 어느 정도인가요', intent: '질문형' },
    { keyword: '퇴직 후 재취업 이력서 50대 어떻게 써야 하나', intent: '방법형' },
  ],

  생활: [
    { keyword: '주방 기름때 한번에 제거하는 방법 베이킹소다', intent: '방법형' },
    { keyword: '냉장고 냄새 없애는 법 가장 효과적인 방법', intent: '방법형' },
    { keyword: '50대 수면 잘 오게 하는 습관 10가지', intent: '방법형' },
    { keyword: '2인 가구 생활비 줄이는 현실적 방법', intent: '방법형' },
    { keyword: '세탁기 청소 직접 하는 법 통세탁', intent: '방법형' },
  ],

  여행: [
    { keyword: '무릎이 안 좋아도 갈 수 있는 국내 여행지', intent: '상황형' },
    { keyword: '60대 여성 혼자 제주 여행 가는 법 안전한가요', intent: '질문형' },
    { keyword: '50대 부부 국내 기차 여행 코스 추천 2박3일', intent: '방법형' },
    { keyword: '시니어 할인 받을 수 있는 여행상품 어디서 찾나', intent: '방법형' },
  ],

  요리: [
    { keyword: '갱년기에 좋은 음식 매일 먹을 수 있는 레시피', intent: '방법형', pillar: '갱년기 완전 정복' },
    { keyword: '혼밥 2인분에서 1인분으로 줄이는 요리법', intent: '방법형' },
    { keyword: '관절에 좋은 식재료 콜라겐 음식 추천', intent: '방법형' },
    { keyword: '당뇨 있을 때 피해야 할 음식 목록', intent: '방법형' },
    { keyword: '50대 이후 단백질 챙겨 먹는 쉬운 방법', intent: '방법형' },
  ],

  취미: [
    { keyword: '50대에 수채화 취미 시작하는 방법 비용은', intent: '방법형' },
    { keyword: '중년 혼자 등산 시작할 때 주의할 점', intent: '방법형' },
    { keyword: '동네 독서모임 만드는 방법 어떻게 시작하나', intent: '방법형' },
    { keyword: '60대 스마트폰 유튜브 활용하는 방법', intent: '방법형' },
  ],

  집꾸미기: [
    { keyword: '자녀방 비운 후 나만의 공간 꾸미는 방법', intent: '방법형' },
    { keyword: '작은 거실 넓어 보이게 꾸미는 인테리어 팁', intent: '방법형' },
    { keyword: '50대 베란다 정원 만드는 법 화분 추천', intent: '방법형' },
  ],

  패션: [
    { keyword: '흰머리 자연스럽게 가리는 염색 방법', intent: '방법형' },
    { keyword: '50대 이후 잘 어울리는 색깔 옷 추천', intent: '방법형' },
    { keyword: '중년 여성 피부 톤업 화장품 추천 순서', intent: '방법형' },
    { keyword: '50대 여름 패션 더워도 시원해 보이는 코디', intent: '방법형' },
  ],
}

/**
 * 카테고리와 주제 텍스트를 받아 관련 롱테일 키워드 최대 N개 반환
 * 주제 키워드와 겹치는 것 우선, 없으면 카테고리에서 랜덤 선택
 */
export function pickLongtailKeywords(category: string, topicText: string, count = 3): LongtailKeyword[] {
  const pool = LONGTAIL_KEYWORDS[category] ?? []
  if (pool.length === 0) return []

  const topicWords = topicText.toLowerCase().replace(/[,.\s]+/g, ' ').split(' ').filter(w => w.length > 1)

  // 주제 단어와 겹치는 키워드 우선
  const matched = pool.filter(kw =>
    topicWords.some(word => kw.keyword.includes(word))
  )

  const result = matched.slice(0, count)

  // 부족하면 카테고리 풀에서 무작위 보충
  if (result.length < count) {
    const remaining = pool.filter(kw => !result.includes(kw))
    const shuffled = remaining.sort(() => Math.random() - 0.5)
    result.push(...shuffled.slice(0, count - result.length))
  }

  return result.slice(0, count)
}
