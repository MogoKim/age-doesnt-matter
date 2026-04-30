import { prisma, disconnect } from '../core/db.js'
import { generateComment, generateReply, getBotUser } from './generator.js'

/**
 * Micro Scheduler — 댓글/대댓글/좋아요 전용 (글쓰기 없음)
 * 메인 스케줄러와 별도 시간대에 실행하여 참여도 극대화
 *
 * 메인 스케줄러 시간대: 09, 10, 11, 13, 14, 15, 16, 19, 21, 22
 * 마이크로 시간대: 08, 12, 18, 23 (겹치지 않음)
 */

type ActivityType = 'comment' | 'reply' | 'like'

interface MicroActivity {
  personaId: string
  type: ActivityType
  board?: string
  count?: number
}

const MICRO_SCHEDULE: Record<string, MicroActivity[]> = {
  // ── 08시: 아침 일찍 — 좋아요 + 짧은 댓글 ──
  '08': [
    // 댓글
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 3 },
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AP', type: 'comment', board: 'HUMOR', count: 3 },
    { personaId: 'L', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AJ', type: 'comment', board: 'STORY', count: 2 },
    // 대댓글
    { personaId: 'AQ', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'E', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'AQ', type: 'like', board: 'STORY', count: 4 },
    { personaId: 'AP', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'L', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AV', type: 'like', board: 'STORY', count: 3 },
  ],

  // ── 12시: 점심 — 활발한 댓글 ──
  '12': [
    // 댓글
    { personaId: 'AO', type: 'comment', board: 'HUMOR', count: 3 },
    { personaId: 'AS', type: 'comment', board: 'JOB', count: 3 },
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 3 },
    { personaId: 'AN', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AX', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AT', type: 'comment', board: 'STORY', count: 2 },
    // 대댓글
    { personaId: 'AO', type: 'reply', board: 'HUMOR', count: 2 },
    { personaId: 'AS', type: 'reply', board: 'JOB', count: 1 },
    { personaId: 'C', type: 'reply', board: 'HUMOR', count: 2 },
    // 좋아요
    { personaId: 'AO', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'AS', type: 'like', board: 'JOB', count: 3 },
    { personaId: 'AT', type: 'like', board: 'STORY', count: 3 },
  ],

  // ── 18시: 저녁 전 — 간병/건강 + 공감 ──
  '18': [
    // 댓글
    { personaId: 'AJ', type: 'comment', board: 'STORY', count: 3 },
    { personaId: 'AK', type: 'comment', board: 'STORY', count: 3 },
    { personaId: 'AM', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AW', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AR', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'Q', type: 'comment', board: 'STORY', count: 2 },
    // 대댓글
    { personaId: 'AJ', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AK', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AW', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AR', type: 'reply', board: 'STORY', count: 2 },
    // 좋아요
    { personaId: 'AJ', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AK', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AM', type: 'like', board: 'STORY', count: 3 },
  ],

  // ── 00시: 심야 — 잠 못 드는 감성 활동 ──
  '00': [
    // 댓글
    { personaId: 'AE', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    // 대댓글
    { personaId: 'E', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'AE', type: 'like', board: 'STORY', count: 3 },
  ],

  // ── 01시: 새벽 — 회상·감성 마무리 ──
  '01': [
    // 댓글
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'I', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 23시: 밤 마무리 — 조용한 활동 ──
  '23': [
    // 댓글
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AE', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'comment', board: 'STORY', count: 2 },
    // 대댓글
    { personaId: 'AE', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'AE', type: 'like', board: 'STORY', count: 4 },
    { personaId: 'P', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AM', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'I', type: 'like', board: 'STORY', count: 3 },
  ],
}

// ── 헬퍼 함수 ──

async function getRandomPosts(board: string, limit: number) {
  return prisma.post.findMany({
    where: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit * 5, 200),
    select: { id: true, title: true, content: true, authorId: true },
  })
}

async function getReplyTargets(board: string, limit: number) {
  const comments = await prisma.comment.findMany({
    where: {
      post: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
      parentId: null,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
    select: {
      id: true,
      content: true,
      postId: true,
      authorId: true,
      post: { select: { title: true } },
    },
  })
  return comments.sort(() => Math.random() - 0.5).slice(0, limit)
}

async function getLikeTargets(userId: string, board: string, limit: number) {
  const posts = await prisma.post.findMany({
    where: {
      boardType: board as 'STORY' | 'HUMOR' | 'JOB',
      status: 'PUBLISHED',
      NOT: { likes: { some: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
    select: { id: true, authorId: true },
  })
  return posts.sort(() => Math.random() - 0.5).slice(0, limit)
}

// ── 활동 실행 (댓글/대댓글/좋아요만 — 글쓰기 없음) ──

async function runMicroActivity(activity: MicroActivity): Promise<void> {
  const userId = await getBotUser(activity.personaId)

  if (activity.type === 'comment') {
    const posts = await getRandomPosts(activity.board ?? 'STORY', activity.count ?? 1)
    for (const post of posts.slice(0, activity.count ?? 1)) {
      // 같은 유저가 같은 글에 이미 댓글 달았으면 스킵
      const existingComment = await prisma.comment.findFirst({
        where: { postId: post.id, authorId: userId },
      })
      if (existingComment) continue

      // 봇 댓글 3개 제한
      const botCommentCount = await prisma.comment.count({
        where: {
          postId: post.id,
          author: { email: { endsWith: '@unao.bot' } },
        },
      })
      if (botCommentCount >= 3) continue

      const commentText = await generateComment(activity.personaId, post.title, post.content)
      if (commentText) {
        await prisma.comment.create({
          data: { postId: post.id, authorId: userId, content: commentText },
        })
        await prisma.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Micro] ${activity.personaId} commented on: "${post.title.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'reply') {
    const targets = await getReplyTargets(activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      if (target.authorId === userId) continue

      const existingReply = await prisma.comment.findFirst({
        where: { parentId: target.id, authorId: userId },
      })
      if (existingReply) continue

      const replyText = await generateReply(activity.personaId, target.post.title, target.content)
      if (replyText) {
        await prisma.comment.create({
          data: {
            postId: target.postId,
            authorId: userId,
            content: replyText,
            parentId: target.id,
          },
        })
        await prisma.post.update({
          where: { id: target.postId },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Micro] ${activity.personaId} replied to comment: "${target.content.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'like') {
    const targets = await getLikeTargets(userId, activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      try {
        await prisma.like.create({
          data: { userId, postId: target.id },
        })
        await prisma.post.update({
          where: { id: target.id },
          data: { likeCount: { increment: 1 } },
        })
        await prisma.user.update({
          where: { id: target.authorId },
          data: { receivedLikes: { increment: 1 } },
        })
        // promotionLevel 승격 체크
        const updatedPost = await prisma.post.findUnique({
          where: { id: target.id },
          select: { likeCount: true },
        })
        if (updatedPost) {
          if (updatedPost.likeCount >= 50) {
            await prisma.post.updateMany({
              where: { id: target.id, promotionLevel: { in: ['NORMAL', 'HOT'] } },
              data: { promotionLevel: 'HALL_OF_FAME' },
            }).catch(() => {})
          } else if (updatedPost.likeCount >= 10) {
            await prisma.post.updateMany({
              where: { id: target.id, promotionLevel: 'NORMAL' },
              data: { promotionLevel: 'HOT' },
            }).catch(() => {})
          }
        }
        console.log(`[Micro] ${activity.personaId} liked post ${target.id.slice(0, 8)}`)
      } catch {
        // unique constraint 위반 시 무시
      }
    }
  }
}

// ── 메인 ──

async function main() {
  const now = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  const hour = kstHour.toString().padStart(2, '0')
  const activities = MICRO_SCHEDULE[hour]

  if (!activities || activities.length === 0) {
    console.log(`[Micro] ${hour}시 — 예정된 마이크로 활동 없음`)
    await disconnect()
    return
  }

  let successCount = 0
  let errorCount = 0

  for (const activity of activities) {
    try {
      await runMicroActivity(activity)
      successCount++
    } catch (err) {
      console.error(`[Micro] ${activity.personaId} ${activity.type} 실패:`, err)
      errorCount++
    }
  }

  await prisma.botLog.create({
    data: {
      botType: 'SEED' as const,
      action: `MICRO_SCHEDULE_${hour}`,
      status: errorCount === 0 ? 'SUCCESS' as const : 'PARTIAL' as const,
      details: JSON.stringify({
        hour,
        success: successCount,
        errors: errorCount,
        totalActivities: activities.length,
      }),
      itemCount: successCount,
      executionTimeMs: 0,
    },
  })

  console.log(`[Micro] ${hour}시 완료: 성공 ${successCount}, 실패 ${errorCount}`)
  await disconnect()
}

main().catch((err) => {
  console.error('[Micro] 치명적 오류:', err)
  process.exit(1)
})
