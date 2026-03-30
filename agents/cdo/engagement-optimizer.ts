import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CDO 에이전트 — 댓글/좋아요 KPI 분석
 * 일간 참여도 메트릭 계산 + 목표 대비 비교
 */

/** 일간 목표치 */
const TARGETS = {
  commentsPerDay: { min: 150, max: 200 },
  repliesPerDay: { min: 60, max: 80 },
  likesPerDay: { min: 100, max: 150 },
}

async function main() {
  console.log('[CDO] 참여도 분석 시작')
  const start = Date.now()

  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

    // 1. 일간 참여도 메트릭
    const [
      todayComments,
      todayReplies,
      todayLikes,
      todayPosts,
      yesterdayComments,
      yesterdayReplies,
      yesterdayLikes,
      yesterdayPosts,
    ] = await Promise.all([
      prisma.comment.count({ where: { createdAt: { gte: todayStart }, parentId: null } }),
      prisma.comment.count({ where: { createdAt: { gte: todayStart }, parentId: { not: null } } }),
      prisma.like.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart }, parentId: null } }),
      prisma.comment.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart }, parentId: { not: null } } }),
      prisma.like.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.post.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart }, status: 'PUBLISHED' } }),
    ])

    // 2. 비율 계산
    const commentsPerPost = todayPosts > 0 ? (todayComments / todayPosts).toFixed(1) : '0'
    const likesPerPost = todayPosts > 0 ? (todayLikes / todayPosts).toFixed(1) : '0'
    const replyRate = todayComments > 0 ? ((todayReplies / todayComments) * 100).toFixed(1) : '0'

    // 3. 보드 타입별 참여도
    const boardTypes = ['STORY', 'HUMOR', 'JOB', 'WEEKLY']
    const boardMetrics: Array<{ board: string; posts: number; comments: number; likes: number }> = []

    for (const board of boardTypes) {
      const [posts, comments, likes] = await Promise.all([
        prisma.post.count({
          where: { boardType: board, createdAt: { gte: todayStart }, status: 'PUBLISHED' },
        }),
        prisma.comment.count({
          where: { post: { boardType: board }, createdAt: { gte: todayStart } },
        }),
        prisma.like.count({
          where: { post: { boardType: board }, createdAt: { gte: todayStart } },
        }),
      ])
      boardMetrics.push({ board, posts, comments, likes })
    }

    // 4. 목표 대비 평가
    const commentStatus = todayComments >= TARGETS.commentsPerDay.min ? 'ON_TRACK' : 'BELOW'
    const replyStatus = todayReplies >= TARGETS.repliesPerDay.min ? 'ON_TRACK' : 'BELOW'
    const likeStatus = todayLikes >= TARGETS.likesPerDay.min ? 'ON_TRACK' : 'BELOW'

    // 5. 전일 대비 변화
    const commentChange = yesterdayComments > 0
      ? (((todayComments - yesterdayComments) / yesterdayComments) * 100).toFixed(0)
      : 'N/A'
    const likeChange = yesterdayLikes > 0
      ? (((todayLikes - yesterdayLikes) / yesterdayLikes) * 100).toFixed(0)
      : 'N/A'

    // 6. 보드별 리포트
    const boardReport = boardMetrics
      .map(b => `  ${b.board}: 글 ${b.posts} / 댓글 ${b.comments} / 좋아요 ${b.likes}`)
      .join('\n')

    const statusEmoji = (s: string) => s === 'ON_TRACK' ? 'OK' : 'BELOW'

    const body = `*일간 참여도 KPI*

*오늘 현황:*
  게시글: ${todayPosts}건
  댓글: ${todayComments}건 [${statusEmoji(commentStatus)}] (목표 ${TARGETS.commentsPerDay.min}-${TARGETS.commentsPerDay.max})
  대댓글: ${todayReplies}건 [${statusEmoji(replyStatus)}] (목표 ${TARGETS.repliesPerDay.min}-${TARGETS.repliesPerDay.max})
  좋아요: ${todayLikes}건 [${statusEmoji(likeStatus)}] (목표 ${TARGETS.likesPerDay.min}-${TARGETS.likesPerDay.max})

*비율:*
  댓글/글: ${commentsPerPost}
  좋아요/글: ${likesPerPost}
  대댓글 비율: ${replyRate}%

*전일 대비:*
  댓글: ${commentChange}% / 좋아요: ${likeChange}%

*보드별:*
${boardReport}`

    const isOnTrack = commentStatus === 'ON_TRACK' && replyStatus === 'ON_TRACK'

    await notifySlack({
      level: isOnTrack ? 'info' : 'important',
      agent: 'CDO',
      title: `참여도 KPI ${isOnTrack ? '정상' : '목표 미달'}`,
      body,
    })

    const summary = `참여도: 댓글 ${todayComments}(${commentStatus}), 대댓글 ${todayReplies}(${replyStatus}), 좋아요 ${todayLikes}(${likeStatus})`

    await prisma.botLog.create({
      data: {
        botType: 'CDO',
        action: 'ENGAGEMENT_OPTIMIZE',
        status: isOnTrack ? 'SUCCESS' : 'FAILED',
        details: summary,
        itemCount: todayComments + todayReplies + todayLikes,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CDO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CDO] 참여도 분석 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'CDO',
        action: 'ENGAGEMENT_OPTIMIZE',
        status: 'FAILED',
        details: errorMsg,
        itemCount: 0,
        executionTimeMs: Date.now() - start,
      },
    })
  } finally {
    await disconnect()
  }
}

main()
