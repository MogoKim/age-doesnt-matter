// 욕망/감정 분류 단일 정의 (agents측 SSOT).
// 기준 = psych-analyzer 프롬프트 + DB 실측(CafePost.desireCategory) 일치하는 정규 21개.
// ⚠️ src/는 이 파일을 import 불가(CLAUDE.md: agents↔src 런타임 import 금지)
//    → src 측은 src/lib/desire-labels.ts 에 키 동기화 사본 유지(값 동일).
// ⚠️ 정의 외 값(TOURISM·WORK·HONOR·GIFT·ENTERTAINMENT·COMMUNITY·RETIREMENT·SOCIAL 등 AI 환각)은
//    GENERAL/null 로 간주. 신규 분류 추가 시 이 파일 + src/lib/desire-labels.ts + schema 주석 3곳 동시 갱신.

export const DESIRE_CATEGORIES = {
  HEALTH: '건강/증상/병원',
  FAMILY: '가족/자녀/남편/손주',
  MONEY: '돈/재테크/연금',
  RETIRE: '은퇴/노후/인생2막',
  JOB: '일자리/구인/취업',
  RELATION: '관계/외로움/소통',
  HOBBY: '취미/여가/활동',
  MEANING: '삶의 의미/철학',
  DIGNITY: '존중/인정/자존감',
  LEGACY: '자식에게 남기기/기억',
  CARE: '돌봄/간병',
  FREEDOM: '자유/독립/나만의 시간',
  HUMOR: '웃긴 상황/유머',
  ENTERTAIN: '연예/드라마/팬덤',
  BEAUTY: '뷰티/피부/미용',
  DIGITAL: '스마트폰/앱/디지털',
  FOOD: '음식/요리/맛집',
  SPIRITUAL: '종교/기도/운세',
  HOUSING: '집/이사/인테리어',
  FASHION: '옷/패션/스타일',
  PET: '반려동물',
} as const

export type DesireCategory = keyof typeof DESIRE_CATEGORIES
export const DESIRE_KEYS = Object.keys(DESIRE_CATEGORIES) as DesireCategory[]

export const EMOTION_TAGS = ['ANXIOUS', 'LONELY', 'ANGRY', 'HOPEFUL', 'RESIGNED', 'GRATEFUL', 'PROUD', 'JEALOUS', 'CONFUSED', 'NOSTALGIC'] as const
export const DESIRE_TYPES = ['big_desire', 'need', 'want', 'demerit'] as const
export const COMMUNITY_SIGNALS = ['question', 'complaint', 'confession', 'recommendation', 'celebration'] as const
export const AGE_SIGNALS = ['50s', '60s', '70s+', 'unknown'] as const
export const VIRAL_TYPES = ['BETRAYAL', 'INJUSTICE', 'CONTROVERSY', 'REVERSAL', 'EMPATHY'] as const
