import { prisma } from './db.js'
import { calculateTrendingScore } from './trending.js'

/** 반응(댓글·좋아요) 발생 후 trendingScore를 현재 카운트 기준으로 즉시 재계산해 DB에 저장 */
export async function refreshPostTrendingScore(postId: string): Promise<void> {
  const p = await prisma.post.findUnique({
    where: { id: postId },
    select: { likeCount: true, commentCount: true, viewCount: true, createdAt: true },
  })
  if (!p) return
  const score = calculateTrendingScore(p.likeCount, p.commentCount, p.viewCount, p.createdAt)
  await prisma.post.update({ where: { id: postId }, data: { trendingScore: score } })
}
