import { prisma, disconnect } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import { generatePost, generateComment, getBotUser } from './generator.js'

/**
 * 시드 콘텐츠 스케줄러
 * Cron에서 시간대별 호출, 해당 시간 알바생 활동 실행
 */

type Activity = {
  personaId: string
  type: 'post' | 'comment' | 'like'
  board?: string
  count?: number
}

/** 시간대별 활동 스케줄 */
const SCHEDULE: Record<string, Activity[]> = {
  '09': [
    { personaId: 'A', type: 'post' },
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 3 },
  ],
  '10': [
    { personaId: 'B', type: 'post' },
  ],
  '14': [
    { personaId: 'D', type: 'comment', board: 'JOB', count: 2 },
    { personaId: 'E', type: 'comment', board: 'STORY', count: 1 },
  ],
  '16': [
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
  ],
  '19': [
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
  ],
  '21': [
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 2 },
  ],
}

async function checkUGCRatio(): Promise<{ ratio: number; shouldReduce: boolean; shouldStop: boolean }> {
  const [totalPosts, userPosts] = await Promise.all([
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({ where: { source: 'USER', status: 'PUBLISHED' } }),
  ])
  const ratio = totalPosts > 0 ? userPosts / totalPosts : 0
  return { ratio, shouldReduce: ratio >= 0.5, shouldStop: ratio >= 0.7 }
}

async function getRandomPosts(board: string, limit: number) {
  return prisma.post.findMany({
    where: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: limit * 3,
    select: { id: true, title: true, content: true },
  })
}

async function runActivity(activity: Activity): Promise<void> {
  const userId = await getBotUser(activity.personaId)

  if (activity.type === 'post') {
    const { title, content, boardType } = await generatePost(activity.personaId)
    await prisma.post.create({
      data: {
        title,
        content: `<p>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
        boardType: boardType as 'STORY' | 'HUMOR',
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
    // 같은 글에 이미 댓글 단 봇이 있는지 확인
    for (const post of posts.slice(0, activity.count ?? 1)) {
      const existingBotComment = await prisma.comment.findFirst({
        where: {
          postId: post.id,
          author: { email: { endsWith: '@unao.bot' } },
        },
      })
      if (existingBotComment) continue // 안전장치: 같은 글에 봇 1명만

      const commentText = await generateComment(activity.personaId, post.title, post.content)
      if (commentText) {
        await prisma.comment.create({
          data: {
            postId: post.id,
            authorId: userId,
            content: commentText,
          },
        })
        // 댓글 카운트 증가
        await prisma.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Seed] ${activity.personaId} commented on: "${post.title.slice(0, 30)}"`)
      }
    }
  }
}

async function main() {
  const hour = new Date().getHours().toString().padStart(2, '0')
  const activities = SCHEDULE[hour]

  if (!activities || activities.length === 0) {
    console.log(`[Seed] ${hour}시 — 예정된 활동 없음`)
    await disconnect()
    return
  }

  // UGC 비율 체크
  const { ratio, shouldReduce, shouldStop } = await checkUGCRatio()
  console.log(`[Seed] UGC 비율: ${(ratio * 100).toFixed(1)}%`)

  if (shouldStop) {
    console.log('[Seed] UGC 70% 이상 — 시드 콘텐츠 중단')
    await notifyAdmin({
      level: 'info',
      agent: 'SEED',
      title: '시드 콘텐츠 자동 중단',
      body: `UGC 비율 ${(ratio * 100).toFixed(1)}% — 70% 초과로 시드 봇 중단`,
    })
    await disconnect()
    return
  }

  // 50% 이상이면 절반만 실행
  const toRun = shouldReduce
    ? activities.filter((_, i) => i % 2 === 0)
    : activities

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
      details: JSON.stringify({ hour, success: successCount, errors: errorCount, ugcRatio: ratio }),
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
