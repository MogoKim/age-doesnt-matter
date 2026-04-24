/** 상대 시간 표시 (API_CONTRACT 규칙) */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 7) return `${days}일 전`

  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/** 급여 정규화: "월급 2,800,000원 ~ 2,800,000원" → "월 280만원" */
export function formatSalary(raw: string | null | undefined): string {
  if (!raw || raw.trim() === '') return '급여 협의'

  const cleaned = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim()

  // 이미 "월 200만" 형식이면 그대로
  if (/^(월|시급)\s*\d+[~\-]?\d*만/.test(cleaned)) return cleaned.endsWith('원') ? cleaned : cleaned + '원'

  // "월급 2800000원 ~ 3000000원"
  const rangeMatch = cleaned.match(/(\d{4,})원?\s*[~\-]\s*(\d{4,})원?/)
  if (rangeMatch) {
    const lowRaw = parseInt(rangeMatch[1])
    const highRaw = parseInt(rangeMatch[2])
    if (lowRaw >= 100000 || highRaw >= 100000) {
      const low = Math.round(lowRaw / 10000)
      const high = Math.round(highRaw / 10000)
      if (low === high) return `월 ${low}만원`
      return `월 ${high}만원`
    }
    if (lowRaw >= 5000) {
      return `시급 ${highRaw.toLocaleString()}원`
    }
    return '급여 협의'
  }

  // "2800000원" 단일 — 원본 금액 기준으로 월급/시급 판별
  const singleMatch = cleaned.match(/(\d{4,})원?/)
  if (singleMatch) {
    const rawAmount = parseInt(singleMatch[1])
    if (rawAmount >= 100000) return `월 ${Math.round(rawAmount / 10000)}만원`
    if (rawAmount >= 5000) return `시급 ${rawAmount.toLocaleString()}원`
    return '급여 협의'
  }

  return raw.trim()
}

/** 카테고리별 fallback 이모지 */
const CATEGORY_EMOJI: Record<string, string> = {
  건강: '🏃',
  여행: '✈️',
  요리: '🍳',
  재테크: '💰',
  문화: '🎭',
  운동: '💪',
  취미: '🎨',
  라이프: '🌿',
  뷰티: '💄',
  반려동물: '🐾',
}

export function getCategoryEmoji(category: string): string {
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (category.includes(key)) return emoji
  }
  return '📖'
}

/** 숫자를 1.2k 형식으로 포매팅 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 10000).toFixed(1)}만`
}
