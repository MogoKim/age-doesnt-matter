// 어드민 표시용 욕망 라벨 (src측 SSOT).
// 키 21개 = agents/cafe/desire-taxonomy.ts 와 동기화(값/이모지는 어드민 표시용으로 별도).
// ⚠️ agents↔src 런타임 import 금지(CLAUDE.md)라 코드 공유 불가 — 분류 추가 시 양쪽 동시 갱신.
export const DESIRE_LABELS: Record<string, string> = {
  HEALTH: '🏥 건강불안',
  FAMILY: '👨‍👩‍👧 가족관계',
  MONEY: '💰 경제불안',
  RETIRE: '🌅 인생2막',
  JOB: '💼 일자리',
  RELATION: '🤝 연결갈망',
  HOBBY: '🎨 취미여가',
  MEANING: '✨ 삶의의미',
  DIGNITY: '🙇 존중인정',
  LEGACY: '📜 유산',
  CARE: '🤲 돌봄간병',
  FREEDOM: '🕊️ 자유독립',
  HUMOR: '😆 유머',
  ENTERTAIN: '📺 연예팬덤',
  BEAUTY: '💄 뷰티',
  DIGITAL: '📱 디지털',
  FOOD: '🍱 음식요리',
  SPIRITUAL: '🙏 종교영성',
  HOUSING: '🏠 주거',
  FASHION: '👗 패션',
  PET: '🐶 반려동물',
}
