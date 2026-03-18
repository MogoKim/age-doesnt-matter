import { prisma } from '@/lib/prisma'
import type { Grade } from '@/generated/prisma/client'

interface GradeInfo {
  emoji: string
  label: string
}

export const GRADE_INFO: Record<Grade, GradeInfo> = {
  SPROUT: { emoji: '🌱', label: '새싹' },
  REGULAR: { emoji: '🌿', label: '단골' },
  VETERAN: { emoji: '💎', label: '터줏대감' },
  WARM_NEIGHBOR: { emoji: '☀️', label: '따뜻한이웃' },
}

/**
 * 글/댓글 작성 후 호출 — 등급 자동 승급 체크
 * WARM_NEIGHBOR는 PO 수동 부여만 가능
 */
export async function checkAndPromote(userId: string): Promise<Grade | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { grade: true, postCount: true, commentCount: true, receivedLikes: true },
  })

  if (!user) return null

  let newGrade: Grade | null = null

  if (user.grade === 'SPROUT') {
    if (user.postCount >= 5 || user.commentCount >= 20) {
      newGrade = 'REGULAR'
    }
  } else if (user.grade === 'REGULAR') {
    if (user.postCount >= 20 && user.receivedLikes >= 100) {
      newGrade = 'VETERAN'
    }
  }

  if (newGrade) {
    await prisma.user.update({
      where: { id: userId },
      data: { grade: newGrade },
    })
  }

  return newGrade
}
