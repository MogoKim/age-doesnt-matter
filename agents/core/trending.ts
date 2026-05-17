/** 마지막 KST 12:00을 UTC Date로 반환 */
function getLastNoon(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const noon = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 3, 0, 0, 0))
  if (noon > now) noon.setUTCDate(noon.getUTCDate() - 1)
  return noon
}

/** 새벽~오전 조용한 시간대 보너스 (KST 기준) */
function getQuietHoursBonus(): number {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  if (kstHour < 6) return 1.5
  if (kstHour < 12) return 1.2
  return 1.0
}

/**
 * trendingScore 계산 공식
 * score = (likeCount×3 + commentCount×5 + viewCount×0.1) × bonus / (noonAge + 2)^1.5
 */
export function calculateTrendingScore(
  likeCount: number,
  commentCount: number,
  viewCount: number,
): number {
  const noonAge = (Date.now() - getLastNoon().getTime()) / (1000 * 60 * 60)
  const bonus = getQuietHoursBonus()
  const score =
    (likeCount * 3 + commentCount * 5 + viewCount * 0.1) * bonus /
    Math.pow(noonAge + 2, 1.5)
  return Math.round(score * 1000) / 1000
}
