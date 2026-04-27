import { prisma } from '@/lib/prisma'
import type { Grade } from '@/generated/prisma/client'
import { pushService } from '@/lib/push/service'

interface GradeInfo {
  emoji: string
  label: string
}

export const GRADE_INFO: Record<Grade, GradeInfo> = {
  SPROUT: { emoji: '🌱', label: '새싹' },
  REGULAR: { emoji: '🌿', label: '단골' },
  WARM_NEIGHBOR: { emoji: '☀️', label: '따뜻한이웃' },
  HONORARY: { emoji: '🏅', label: '명예우나어인' },
}

const GRADE_THRESHOLDS = {
  SPROUT_TO_REGULAR: { posts: 5, comments: 20 },
  REGULAR_TO_WARM: { posts: 20, likes: 100 },
} as const

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
    if (user.postCount >= GRADE_THRESHOLDS.SPROUT_TO_REGULAR.posts || user.commentCount >= GRADE_THRESHOLDS.SPROUT_TO_REGULAR.comments) {
      newGrade = 'REGULAR'
    }
  } else if (user.grade === 'REGULAR') {
    if (user.postCount >= GRADE_THRESHOLDS.REGULAR_TO_WARM.posts && user.receivedLikes >= GRADE_THRESHOLDS.REGULAR_TO_WARM.likes) {
      newGrade = 'WARM_NEIGHBOR'
    }
  }

  if (newGrade) {
    await prisma.user.update({
      where: { id: userId },
      data: { grade: newGrade },
    })
    await prisma.notification.create({
      data: {
        userId,
        type: 'GRADE_UP',
        content: `축하해요! ${GRADE_INFO[newGrade].label} 등급으로 올라가셨어요 🎉`,
      },
    }).catch(() => {})
    void pushService.notify(userId, {
      title: '등급이 올랐어요 🎉',
      body: `${GRADE_INFO[newGrade].label} 등급으로 승격되었습니다!`,
      url: '/my',
      tag: 'grade-up',
    }, 'grade_up').catch(() => {})
  }

  return newGrade
}
