import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { generateComment, getBotUser } from '../seed/generator.js'

/**
 * COO 에이전트 — 느슨한 연결 촉진
 * P1 영숙씨 타겟: 댓글 0-1개인 STORY 게시글에 따뜻한 댓글 달기
 */

/** P1 연결 촉진에 적합한 페르소나 */
const CONNECTION_PERSONAS = ['AQ', 'AV', 'AW', 'E']

async function main() {
  console.log('[COO] 연결 촉진 시작')
  const start = Date.now()
  let facilitatedCount = 0

  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

    // 1. STORY 보드에서 댓글 0-1개인 게시글 찾기
    const orphanPosts = await prisma.post.findMany({
      where: {
        boardType: 'STORY',
        status: 'PUBLISHED',
        createdAt: { gte: sixHoursAgo },
        commentCount: { lte: 1 },
      },
      select: {
        id: true,
        title: true,
        content: true,
        commentCount: true,
        authorId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    if (orphanPosts.length === 0) {
      console.log('[COO] 연결 촉진 대상 없음')
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          action: 'CONNECTION_FACILITATE',
          status: 'SUCCESS',
          details: '대상 게시글 없음',
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    // 2. 3-5개 선택
    const selectedPosts = orphanPosts.slice(0, Math.min(5, Math.max(3, orphanPosts.length)))

    for (const post of selectedPosts) {
      try {
        // 랜덤 페르소나 선택
        const personaId = CONNECTION_PERSONAS[Math.floor(Math.random() * CONNECTION_PERSONAS.length)]
        const botUserId = await getBotUser(personaId)

        // 본인 글에 본인이 댓글 다는 것 방지
        if (botUserId === post.authorId) continue

        // 이미 이 봇이 댓글 단 글인지 체크
        const existing = await prisma.comment.findFirst({
          where: { postId: post.id, authorId: botUserId },
        })
        if (existing) continue

        // 따뜻한 댓글 생성
        const commentText = await generateComment(personaId, post.title, post.content)

        await prisma.comment.create({
          data: {
            postId: post.id,
            authorId: botUserId,
            content: commentText,
            status: 'ACTIVE',
          },
        })

        await prisma.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        })

        facilitatedCount++
        console.log(`[COO] 연결 촉진: "${post.title}" ← ${personaId}`)
      } catch (err) {
        console.error(`[COO] 댓글 생성 실패 (post ${post.id}):`, err)
      }
    }

    const summary = `연결 촉진 완료: ${facilitatedCount}건 댓글 (대상 ${selectedPosts.length}건)`

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'CONNECTION_FACILITATE',
        status: 'SUCCESS',
        details: summary,
        itemCount: facilitatedCount,
        executionTimeMs: Date.now() - start,
      },
    })

    if (facilitatedCount > 0) {
      await notifySlack({
        level: 'info',
        agent: 'COO',
        title: '느슨한 연결 촉진',
        body: summary,
      })
    }

    console.log(`[COO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[COO] 연결 촉진 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'CONNECTION_FACILITATE',
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
