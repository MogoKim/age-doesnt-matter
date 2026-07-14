/**
 * 오늘의 투표 선택지 라벨 — 팝업·HERO·게시글·댓글 공용.
 * Day 1 옵션(잔소리형/무뚝뚝형)에만 이모지를 붙이고, 그 외는 텍스트 그대로(Day 2+ 대비).
 */

export function optionEmoji(option: string): string {
  if (option === '잔소리형') return '🔥'
  if (option === '무뚝뚝형') return '🧊'
  return ''
}

/** 선택 버튼·결과 막대용 — "🔥 잔소리형" */
export function optionLabel(option: string): string {
  const e = optionEmoji(option)
  return e ? `${e} ${option}` : option
}

/** 진영 pill·카운트용 — "🔥 잔소리파" ("형"은 "파"로 축약) */
export function campLabel(option: string): string {
  const base = option.endsWith('형') ? option.slice(0, -1) : option
  const e = optionEmoji(option)
  return e ? `${e} ${base}파` : `${base}파`
}
