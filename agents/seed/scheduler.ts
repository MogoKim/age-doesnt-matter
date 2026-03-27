import { prisma, disconnect } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import { generatePost, generateComment, generateReply, getBotUser } from './generator.js'

/**
 * 시드 콘텐츠 스케줄러 (20명 — A~T)
 * 크롤링 08:30/12:30/20:40에 연동하여 시드봇 활동
 * 활동: 글쓰기, 댓글, 대댓글, 좋아요
 */

type ActivityType = 'post' | 'comment' | 'reply' | 'like'

interface Activity {
  personaId: string
  type: ActivityType
  board?: string
  count?: number
}

/**
 * 시간대별 활동 스케줄 (20명 A~T)
 * 크롤링 후 30분~1시간 뒤 시드봇 활동 시작
 * 08:30 크롤링 → 09:00/10:00 시드
 * 12:30 크롤링 → 13:00/14:00 시드
 * 20:40 크롤링 → 21:00/22:00 시드
 * + 15:00/16:00/19:00 자체 활동
 */
const SCHEDULE: Record<string, Activity[]> = {
  // ── 아침 (크롤링 08:30 후) ──
  '09': [
    { personaId: 'A', type: 'post' },                         // 영숙이맘 일상 글
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 3 },
    { personaId: 'F', type: 'post' },                         // 텃밭아저씨 아침 글
    { personaId: 'J', type: 'post' },                         // 요리왕 아침 글
    { personaId: 'L', type: 'post' },                         // 손주바보 가족 글
    { personaId: 'Q', type: 'post' },                         // 반려견아빠 산책 글
    { personaId: 'S', type: 'post' },                         // 텃밭할머니 꽃 글
    // 좋아요
    { personaId: 'E', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'L', type: 'like', board: 'STORY', count: 2 },
  ],
  '10': [
    { personaId: 'B', type: 'post' },                         // 은퇴신사 정보 글
    { personaId: 'G', type: 'post' },                         // 여행매니아 글
    { personaId: 'K', type: 'post' },                         // 패션언니 뷰티 글
    { personaId: 'M', type: 'post' },                         // 등산러버 등산 글
    { personaId: 'R', type: 'post' },                         // 드라마덕후 감상 글
    // 대댓글 — 아침 글 댓글에 답글
    { personaId: 'A', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'G', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'C', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'K', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 점심 (크롤링 12:30 후) ──
  '13': [
    { personaId: 'D', type: 'comment', board: 'JOB', count: 2 },
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'N', type: 'comment', board: 'STORY', count: 2 },
    // 좋아요
    { personaId: 'D', type: 'like', board: 'JOB', count: 2 },
    { personaId: 'J', type: 'like', board: 'STORY', count: 2 },
  ],
  '14': [
    { personaId: 'H', type: 'post' },                         // 건강박사 건강 글
    { personaId: 'N', type: 'post' },                         // 살림9단 살림 글
    { personaId: 'T', type: 'post' },                         // 은퇴교사 교육 글
    { personaId: 'J', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'comment', board: 'STORY', count: 1 },
    // 대댓글
    { personaId: 'E', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'H', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'N', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'T', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 오후 자체 활동 ──
  '15': [
    { personaId: 'P', type: 'post' },                         // 커피한잔 감성 에세이
    { personaId: 'K', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    // 좋아요
    { personaId: 'P', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'G', type: 'like', board: 'STORY', count: 2 },
  ],
  '16': [
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'L', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'Q', type: 'comment', board: 'STORY', count: 1 },
    // 대댓글
    { personaId: 'L', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'A', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 저녁 ──
  '19': [
    { personaId: 'I', type: 'post' },                         // 책벌레 독서 글
    { personaId: 'O', type: 'post' },                         // 음악사랑 음악 글
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'G', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'T', type: 'comment', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'I', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'O', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 밤 (크롤링 20:40 후) ──
  '21': [
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'H', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'I', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'N', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'O', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    // 대댓글
    { personaId: 'C', type: 'reply', board: 'HUMOR', count: 1 },
    { personaId: 'R', type: 'reply', board: 'HUMOR', count: 1 },
    // 좋아요
    { personaId: 'B', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'Q', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'like', board: 'STORY', count: 2 },
  ],
  '22': [
    { personaId: 'B', type: 'comment', board: 'STORY', count: 1 },
    // 대댓글
    { personaId: 'B', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요 마무리
    { personaId: 'H', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'like', board: 'HUMOR', count: 2 },
  ],
}

async function getRandomPosts(board: string, limit: number) {
  return prisma.post.findMany({
    where: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: limit * 3,
    select: { id: true, title: true, content: true, authorId: true },
  })
}

/** 댓글이 달린 글에서 대댓글 타겟 찾기 */
async function getReplyTargets(board: string, limit: number) {
  const comments = await prisma.comment.findMany({
    where: {
      post: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
      parentId: null, // 최상위 댓글만
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
  // 셔플
  return comments.sort(() => Math.random() - 0.5).slice(0, limit)
}

/** 좋아요할 글 찾기 (아직 좋아요 안 한 글) */
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

async function runActivity(activity: Activity): Promise<void> {
  const userId = await getBotUser(activity.personaId)

  if (activity.type === 'post') {
    const { title, content, boardType, category } = await generatePost(activity.personaId)
    await prisma.post.create({
      data: {
        title,
        content: `<p>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
        boardType: boardType as 'STORY' | 'HUMOR',
        category: category ?? null,
        authorId: userId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })
    console.log(`[Seed] ${activity.personaId} posted: "${title}"`)
  }

  if (activity.type === 'comment') {
    const posts = await getRandomPosts(activity.board ?? 'STORY', activity.count ?? 1)
    for (const post of posts.slice(0, activity.count ?? 1)) {
      // 같은 글에 이 봇이 이미 댓글 달았는지 확인
      const existingComment = await prisma.comment.findFirst({
        where: { postId: post.id, authorId: userId },
      })
      if (existingComment) continue

      // 같은 글에 봇 댓글이 2개 이상이면 스킵
      const botCommentCount = await prisma.comment.count({
        where: {
          postId: post.id,
          author: { email: { endsWith: '@unao.bot' } },
        },
      })
      if (botCommentCount >= 2) continue

      const commentText = await generateComment(activity.personaId, post.title, post.content)
      if (commentText) {
        await prisma.comment.create({
          data: { postId: post.id, authorId: userId, content: commentText },
        })
        await prisma.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Seed] ${activity.personaId} commented on: "${post.title.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'reply') {
    const targets = await getReplyTargets(activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      // 자기 댓글에 답글 달지 않기
      if (target.authorId === userId) continue

      // 같은 댓글에 이미 답글 달았는지 확인
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
        console.log(`[Seed] ${activity.personaId} replied to comment: "${target.content.slice(0, 30)}"`)
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
        // 글 작성자의 receivedLikes 증가
        await prisma.user.update({
          where: { id: target.authorId },
          data: { receivedLikes: { increment: 1 } },
        })
        console.log(`[Seed] ${activity.personaId} liked post ${target.id.slice(0, 8)}`)
      } catch {
        // unique constraint 위반 시 무시 (이미 좋아요)
      }
    }
  }
}

async function main() {
  // KST = UTC + 9 (GitHub Actions는 UTC로 실행)
  const now = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  const hour = kstHour.toString().padStart(2, '0')
  const activities = SCHEDULE[hour]

  if (!activities || activities.length === 0) {
    console.log(`[Seed] ${hour}시 — 예정된 활동 없음`)
    await disconnect()
    return
  }

  const toRun = activities

  let successCount = 0
  let errorCount = 0

  for (const activity of toRun) {
    try {
      await runActivity(activity)
      successCount++
    } catch (err) {
      console.error(`[Seed] ${activity.personaId} ${activity.type} 실패:`, err)
      errorCount++
    }
  }

  // 로그 기록
  await prisma.botLog.create({
    data: {
      botType: 'SEED' as const,
      action: `SCHEDULE_${hour}`,
      status: errorCount === 0 ? 'SUCCESS' as const : 'PARTIAL' as const,
      details: JSON.stringify({
        hour,
        success: successCount,
        errors: errorCount,
        totalActivities: toRun.length,
      }),
      itemCount: successCount,
      executionTimeMs: 0,
    },
  })

  console.log(`[Seed] ${hour}시 완료: 성공 ${successCount}, 실패 ${errorCount}`)
  await disconnect()
}

main().catch((err) => {
  console.error('[Seed] 치명적 오류:', err)
  process.exit(1)
})
