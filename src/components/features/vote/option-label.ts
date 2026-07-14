/**
 * 오늘의 투표 선택지 라벨 — 팝업·HERO·게시글·댓글 공용.
 * Day 1 옵션(잔소리형/무뚝뚝형)에만 이모지를 붙이고, 그 외(갱년기 몸/마음 등)는 텍스트만으로 자연스럽게.
 */

export function optionEmoji(option: string): string {
  if (option === '잔소리형') return '🔥'
  if (option === '무뚝뚝형') return '🧊'
  return ''
}

/** 선택 버튼·결과 막대·헤드라인용 — "🔥 잔소리형" / "화끈거리는 몸" */
export function optionLabel(option: string): string {
  const e = optionEmoji(option)
  return e ? `${e} ${option}` : option
}

/**
 * 진영 pill·댓글 헤더·CTA용 축약 진영명.
 * - 이모지 옵션(Day1): "🔥 잔소리파" ("형"→"파")
 * - 텍스트 옵션(Day2+): 마지막 어절 + " 쪽" → "몸 쪽", "마음 쪽" (긴 문장 억지 "파" 방지)
 */
export function campLabel(option: string): string {
  const e = optionEmoji(option)
  if (e) {
    const base = option.endsWith('형') ? option.slice(0, -1) : option
    return `${e} ${base}파`
  }
  const last = option.trim().split(/\s+/).pop() || option
  return `${last} 쪽`
}

/**
 * 진영 CTA/입력창 문구 — "🔥 잔소리파 편에서 한마디" / "몸 쪽에서 한마디".
 * 이모지 진영(Day1)은 "편에서", 텍스트 진영(Day2 "○○ 쪽")은 "에서"로 자연스럽게 잇는다.
 */
export function campPhrase(option: string, tail: string): string {
  const connector = optionEmoji(option) ? ' 편에서' : '에서'
  return `${campLabel(option)}${connector} ${tail}`
}

/** 을/를 조사 — 마지막 한글의 받침 유무로 결정 (이모지·공백 무시) */
export function eulReul(word: string): string {
  const last = word.replace(/[^가-힣]/g, '').slice(-1)
  if (!last) return '을'
  return (last.charCodeAt(0) - 0xac00) % 28 !== 0 ? '을' : '를'
}
