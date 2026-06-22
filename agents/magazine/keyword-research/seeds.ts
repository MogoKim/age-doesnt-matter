/**
 * 매거진 SEO 키워드 — P0 시드 세트 + 자동완성 확장 매트릭스
 *
 * // LOCAL ONLY — 1회성 키워드 리서치 도구. cron/GitHub Actions/runner.ts 미등록.
 *
 * 시드 출처: 창업자 구글 연관검색어 캡처 17장 + 기존 prompt.ts SEO_KEYWORDS + constitution 페르소나.
 * GSC near-miss는 90일 재프로브(2026-06-22) 스냅샷 — 실제 추출은 gsc-nearmiss.ts에서 런타임 수행.
 */

import type { SeedKeyword } from './scorer.js'

// ─── P0 시드 52개 (6 클러스터) ───────────────────────────

export const SEED_KEYWORDS: SeedKeyword[] = [
  // 1) 갱년기/건강 (민감도 낮음, 핏 최상)
  { keyword: '갱년기', cluster: '갱년기건강', intent: '정보', sensitivity: 'none' },
  { keyword: '갱년기 증상', cluster: '갱년기건강', intent: '질문', sensitivity: 'none' },
  { keyword: '50대 갱년기', cluster: '갱년기건강', intent: '정보', sensitivity: 'none' },
  { keyword: '갱년기 극복법', cluster: '갱년기건강', intent: '방법', sensitivity: 'none' },
  { keyword: '갱년기 영양제', cluster: '갱년기건강', intent: '상업', sensitivity: 'none' },
  { keyword: '갱년기 식단', cluster: '갱년기건강', intent: '방법', sensitivity: 'none' },
  { keyword: '갱년기 불면 수면장애', cluster: '갱년기건강', intent: '질문', sensitivity: 'none' },
  { keyword: '갱년기 다이어트', cluster: '갱년기건강', intent: '질문', sensitivity: 'none' },
  { keyword: '50대 여성 건강검진', cluster: '갱년기건강', intent: '방법', sensitivity: 'none' },
  { keyword: '무릎 관절 통증', cluster: '갱년기건강', intent: '질문', sensitivity: 'none' },

  // 2) 부부관계/성건강 (민감 — 의학근거 + 커뮤니티 톤)
  { keyword: '중년 부부관계', cluster: '부부성건강', intent: '정보', sensitivity: 'medium' },
  { keyword: '갱년기 부부관계', cluster: '부부성건강', intent: '정보', sensitivity: 'medium' },
  { keyword: '갱년기 성건강', cluster: '부부성건강', intent: '정보', sensitivity: 'medium' },
  { keyword: '갱년기 질건조', cluster: '부부성건강', intent: '질문', sensitivity: 'medium' },
  { keyword: '부부관계 안하면', cluster: '부부성건강', intent: '질문', sensitivity: 'medium' },
  { keyword: '부부관계', cluster: '부부성건강', intent: '정보', sensitivity: 'medium' },
  { keyword: '50대 성욕', cluster: '부부성건강', intent: '정보', sensitivity: 'high' },
  { keyword: '50대 여성 성 횟수', cluster: '부부성건강', intent: '정보', sensitivity: 'high' },
  { keyword: '갱년기 바람', cluster: '부부성건강', intent: '탐색', sensitivity: 'high' },

  // 3) 외로움/관계 (핏 최상, 우리 서비스 직결)
  { keyword: '50대 여자 외로움', cluster: '외로움관계', intent: '정보', sensitivity: 'low' },
  { keyword: '빈 둥지 증후군', cluster: '외로움관계', intent: '정보', sensitivity: 'none' },
  { keyword: '중년 친구 만들기', cluster: '외로움관계', intent: '방법', sensitivity: 'none' },
  { keyword: '50대 커뮤니티', cluster: '외로움관계', intent: '탐색', sensitivity: 'none' },
  { keyword: '중년 커뮤니티', cluster: '외로움관계', intent: '탐색', sensitivity: 'none' },
  { keyword: '40대 여자 외로움', cluster: '외로움관계', intent: '정보', sensitivity: 'low' },
  { keyword: '50대 여자 심리', cluster: '외로움관계', intent: '정보', sensitivity: 'low' },
  { keyword: '황혼이혼', cluster: '외로움관계', intent: '정보', sensitivity: 'medium' },
  { keyword: '중년 만남', cluster: '외로움관계', intent: '탐색', sensitivity: 'low' },

  // 4) 일자리/재취업 (핏 최상)
  { keyword: '50대 여자 일자리', cluster: '일자리', intent: '탐색', sensitivity: 'none' },
  { keyword: '60대 여자 일자리', cluster: '일자리', intent: '탐색', sensitivity: 'none' },
  { keyword: '50대 여성 취업 현실', cluster: '일자리', intent: '정보', sensitivity: 'none' },
  { keyword: '경력단절여성 취업', cluster: '일자리', intent: '방법', sensitivity: 'none' },
  { keyword: '60대 여성 알바', cluster: '일자리', intent: '탐색', sensitivity: 'none' },
  { keyword: '50대 주부 일자리', cluster: '일자리', intent: '탐색', sensitivity: 'none' },
  { keyword: '노인일자리사업 신청', cluster: '일자리', intent: '정보', sensitivity: 'none' },
  { keyword: '중장년 자격증', cluster: '일자리', intent: '방법', sensitivity: 'none' },

  // 5) 돈/연금/퇴직 (핏 상, DA90 점유 → 초롱테일 우회)
  { keyword: '국민연금 조기수령', cluster: '돈연금', intent: '비교', sensitivity: 'none' },
  { keyword: '국민연금 수령 시기', cluster: '돈연금', intent: '계산', sensitivity: 'none' },
  { keyword: '퇴직금 IRP', cluster: '돈연금', intent: '계산', sensitivity: 'none' },
  { keyword: '노후 생활비', cluster: '돈연금', intent: '계산', sensitivity: 'none' },
  { keyword: '퇴직 후 건강보험', cluster: '돈연금', intent: '계산', sensitivity: 'none' },
  { keyword: '연금저축 세액공제', cluster: '돈연금', intent: '계산', sensitivity: 'none' },
  { keyword: '기초연금', cluster: '돈연금', intent: '정보', sensitivity: 'none' },

  // 6) 패션/생활/취미 (핏 중, 상업 경쟁)
  { keyword: '흰머리 염색', cluster: '패션생활', intent: '방법', sensitivity: 'none' },
  { keyword: '50대 패션', cluster: '패션생활', intent: '정보', sensitivity: 'none' },
  { keyword: '50대 여성의류 브랜드', cluster: '패션생활', intent: '상업', sensitivity: 'none' },
  { keyword: '50대 엄마 옷', cluster: '패션생활', intent: '상업', sensitivity: 'none' },
  { keyword: '50대 살림 정리 꿀팁', cluster: '패션생활', intent: '방법', sensitivity: 'none' },
  { keyword: '50대 취미 시작', cluster: '패션생활', intent: '방법', sensitivity: 'none' },
  { keyword: '50대 여성', cluster: '패션생활', intent: '정보', sensitivity: 'none' },
  { keyword: '60대 여성', cluster: '패션생활', intent: '정보', sensitivity: 'none' },
  { keyword: '50대 여자', cluster: '외로움관계', intent: '정보', sensitivity: 'low' },
]

/**
 * GSC near-miss 스냅샷 (2026-06-22 90일 재프로브) — 참고/폴백용.
 * 실제 런타임 추출은 gsc-nearmiss.ts (position 8~50, impressions≥1).
 */
export const GSC_NEARMISS_SNAPSHOT: SeedKeyword[] = [
  { keyword: '50대 여자 성욕', cluster: '부부성건강', intent: '정보', sensitivity: 'high' },
  { keyword: '50대 성욕', cluster: '부부성건강', intent: '정보', sensitivity: 'high' },
  { keyword: '50대 여성 갱년기 증상', cluster: '갱년기건강', intent: '질문', sensitivity: 'none' },
  { keyword: '인생2막 새로운 도전', cluster: '외로움관계', intent: '정보', sensitivity: 'none' },
  { keyword: '50대 취업 현실', cluster: '일자리', intent: '정보', sensitivity: 'none' },
]

// ─── 자동완성 확장 매트릭스 ──────────────────────────────

/** 음절 접미 (2번째 단어 분기 강제 노출) */
export const SYLLABLE_SUFFIX: readonly string[] = [
  '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
]

/** 질문/의도 접미 (PAA성 질문형 확보) */
export const INTENT_SUFFIX: readonly string[] = [
  '왜', '언제', '어떻게', '얼마나', '며칠', '몇 살', '방법', '원인', '증상',
  '후기', '추천', '뜻', '효과', '부작용', '나이', '시기', '언제까지', 'vs', '비교',
]

/** 연령 변형 (N대 여자 X 패턴 자동 생성) */
export const AGE_TOKENS: readonly string[] = ['40대', '50대', '60대']

/** 성별 변형 */
export const GENDER_TOKENS: readonly string[] = ['여자', '여성']
