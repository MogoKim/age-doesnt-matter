/** 새벽~오전 조용한 시간대 보너스 (KST 기준) */
function getQuietHoursBonus(): number {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  if (kstHour < 6) return 1.5
  if (kstHour < 12) return 1.2
  return 1.0
}

/**
 * trendingScore 계산 공식
 * score = (likeCount×3 + commentCount×5 + viewCount×0.1) × bonus / (postAge + 2)^1.5
 * postAge: 글 작성 시점부터 경과 시간(시간 단위) — 24시간 신선도 기준
 */
export function calculateTrendingScore(
  likeCount: number,
  commentCount: number,
  viewCount: number,
  createdAt: Date,
): number {
  const postAge = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
  const bonus = getQuietHoursBonus()
  const score =
    (likeCount * 3 + commentCount * 5 + viewCount * 0.1) * bonus /
    Math.pow(postAge + 2, 1.5)
  return Math.round(score * 1000) / 1000
}
