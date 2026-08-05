/**
 * 글자 크기 단계의 **사용자에게 보이는 이름** — 여기 한 곳에서만 정한다.
 *
 * 배경: 같은 단계를 화면마다 다르게 불렀다.
 *   GNB "기본/크게/매우 크게" · 마이페이지 "보통/크게/아주크게" · 푸터 "보통/크게/아주 크게"
 *   게다가 소개 FAQ는 "작게/보통/크게"라고 안내해 어느 화면과도 맞지 않았다.
 *   각자 배열을 따로 들고 있어서 생긴 일이라, 이름을 한 곳으로 모은다.
 *
 * ⚠️ 저장값(NORMAL/LARGE/XLARGE)과 실제 크기는 **건드리지 않는다.**
 *   이름만 바꾸는 것이라 지금 쓰는 사람의 글씨 크기는 한 명도 변하지 않는다.
 *   - NORMAL 18px → "작게"  (예전 '기본'. 승격 이후 스스로 다시 고른 사람들)
 *   - LARGE  20px → "기본"  (미설정 신규 포함 대다수)
 *   - XLARGE 24px → "크게"
 *   저장값을 바꾸거나 localStorage를 지우면 그 사람이 고른 크기가 강제로 바뀐다.
 */

export const FONT_SIZE_VALUES = ['NORMAL', 'LARGE', 'XLARGE'] as const

export type FontSizeValue = (typeof FONT_SIZE_VALUES)[number]

/** 화면에 그대로 쓰는 이름 */
export const FONT_SIZE_LABELS: Record<FontSizeValue, string> = {
  NORMAL: '작게',
  LARGE: '기본',
  XLARGE: '크게',
}

/**
 * 본문 기준 크기 — 마이페이지 설정에서 이름 옆에 함께 보여준다.
 * globals.css의 --text-body 값과 같아야 한다(:root / [data-font-size=LARGE] / [XLARGE]).
 */
export const FONT_SIZE_BODY_PX: Record<FontSizeValue, string> = {
  NORMAL: '18px',
  LARGE: '20px',
  XLARGE: '24px',
}

/** 저장값이 3종 중 하나인지 — 이상값 방어용 */
export function isFontSizeValue(v: unknown): v is FontSizeValue {
  return typeof v === 'string' && (FONT_SIZE_VALUES as readonly string[]).includes(v)
}
