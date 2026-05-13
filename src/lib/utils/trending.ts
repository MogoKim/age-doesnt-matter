// KST 정오(12:00) 기준 trendingScore 헬퍼 — 서버 전용 (클라이언트 호출 금지)

/** 마지막 KST 12:00을 UTC Date로 반환 */
export function getLastNoon(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000) // UTC+9 오프셋 적용
  // KST 12:00 = UTC 03:00
  const noon = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 3, 0, 0, 0))
  if (noon > now) noon.setUTCDate(noon.getUTCDate() - 1) // KST 정오 전이면 어제 정오
  return noon
}

/** 새벽~오전 조용한 시간대 보너스 (KST 기준) */
export function getQuietHoursBonus(): number {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  if (kstHour < 6) return 1.5  // 00~06 KST: 새벽 engagement는 진짜 반응
  if (kstHour < 12) return 1.2 // 06~12 KST: 오전
  return 1.0                    // 12~24 KST: 기본값
}

/**
 * trendingScore 계산 공식
 * score = (likeCount×3 + commentCount×5 + viewCount×0.1) × bonus / (noonAge + 2)^1.5
 * noonAge: 마지막 정오로부터 경과 시간(시간 단위)
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
