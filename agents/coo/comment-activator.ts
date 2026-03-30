import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { generateComment, getBotUser } from '../seed/generator.js'

/**
 * COO 에이전트 — 댓글 활성화
 * 댓글 없는 글에 시드봇 댓글 배치 (보드 타입별 페르소나 매칭)
 */

/** 보드 타입별 적합한 페르소나 */
const BOARD_PERSONAS: Record<string, string[]> = {
  STORY: ['E', 'AQ', 'AV'],
  HUMOR: ['C', 'AP', 'AO'],
  JOB: ['AS', 'D'],
  WEEKLY: ['AQ', 'E', 'AR'],
}

/** 봇 댓글 제한 per post */
const MAX_BOT_COMMENTS_PER_POST = 3

async function main() {
  console.log('[COO] 댓글 활성화 시작')
  const start = Date.now()
  let activatedCount = 0
  let postCount = 0

  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    // 1. 댓글 0개인 게시글 찾기 (최근 12시간, 최대 10개)
    const zeroPosts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        commentCount: 0,
        createdAt: { gte: twelveHoursAgo },
      },
      select: {
        id: true,
        title: true,
        content: true,
        boardType: true,
        authorId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    if (zeroPosts.length === 0) {
      console.log('[COO] 댓글 활성화 대상 없음')
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          action: 'COMMENT_ACTIVATE',
          status: 'SUCCESS',
          details: '댓글 0개 게시글 없음',
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    for (const post of zeroPosts) {
      try {
        // 보드 타입에 맞는 페르소나 2명 선택
        const personas = BOARD_PERSONAS[post.boardType] ?? BOARD_PERSONAS['STORY']
        const shuffled = [...personas].sort(() => Math.random() - 0.5)
        const selected = shuffled.slice(0, 2)

        // 이미 봇 댓글 수 체크
        const botEmails = selected.map(id => `bot-${id.toLowerCase()}@unao.bot`)
        const botUsers = await prisma.user.findMany({
          where: { email: { in: botEmails } },
          select: { id: true },
        })
        const botUserIds = botUsers.map(u => u.id)

        const existingBotComments = await prisma.comment.count({
          where: {
            postId: post.id,
            authorId: { in: botUserIds },
          },
        })

        if (existingBotComments >= MAX_BOT_COMMENTS_PER_POST) continue

        let commentsAdded = 0
        for (const personaId of selected) {
          if (existingBotComments + commentsAdded >= MAX_BOT_COMMENTS_PER_POST) break

          const botUserId = await getBotUser(personaId)
          if (botUserId === post.authorId) continue

          // 중복 체크
          const existing = await prisma.comment.findFirst({
            where: { postId: post.id, authorId: botUserId },
          })
          if (existing) continue

          const commentText = await generateComment(personaId, post.title, post.content)

          await prisma.comment.create({
            data: {
              postId: post.id,
              authorId: botUserId,
              content: commentText,
              status: 'ACTIVE',
            },
          })

          commentsAdded++
          activatedCount++
        }

        if (commentsAdded > 0) {
          await prisma.post.update({
            where: { id: post.id },
            data: { commentCount: { increment: commentsAdded } },
          })
          postCount++
        }

        console.log(`[COO] 댓글 활성화: "${post.title}" (${post.boardType}) +${commentsAdded}`)
      } catch (err) {
        console.error(`[COO] 댓글 활성화 실패 (post ${post.id}):`, err)
      }
    }

    const summary = `댓글 활성화 완료: ${postCount}개 게시글에 ${activatedCount}개 댓글 배치`

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'COMMENT_ACTIVATE',
        status: 'SUCCESS',
        details: summary,
        itemCount: activatedCount,
        executionTimeMs: Date.now() - start,
      },
    })

    if (activatedCount > 0) {
      await notifySlack({
        level: 'info',
        agent: 'COO',
        title: '댓글 활성화',
        body: summary,
      })
    }

    console.log(`[COO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[COO] 댓글 활성화 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'COMMENT_ACTIVATE',
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
