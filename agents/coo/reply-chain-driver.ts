import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { generateReply, getBotUser } from '../seed/generator.js'
import { REPLY_CHAINS, getChainsForTrigger } from '../seed/reply-chains.js'
import { safeBotLog } from '../core/safe-log.js'

/**
 * COO 에이전트 — 대댓글 체인 생성
 * trigger 페르소나의 댓글에 responder 페르소나가 답글을 달아 자연스러운 대화 흐름 생성
 */

/** 체인 실행 제한 per run */
const MAX_CHAINS_PER_RUN = 5

async function main() {
  console.log('[COO] 대댓글 체인 생성 시작')
  const start = Date.now()
  let chainCount = 0
  let replyCount = 0

  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    // 1. trigger 페르소나들의 이메일 목록
    const triggerPersonaIds = [...new Set(REPLY_CHAINS.map(c => c.trigger))]
    const triggerEmails = triggerPersonaIds.map(id => `bot-${id.toLowerCase()}@unao.bot`)

    // 2. trigger 봇 유저 조회
    const triggerUsers = await prisma.user.findMany({
      where: { email: { in: triggerEmails } },
      select: { id: true, email: true },
    })

    if (triggerUsers.length === 0) {
      console.log('[COO] trigger 페르소나 유저 없음')
      await safeBotLog({ botType: 'COO', action: 'REPLY_CHAIN_DRIVE', status: 'SUCCESS', details: 'trigger 유저 없음', itemCount: 0, executionTimeMs: Date.now() - start })
      return
    }

    const triggerUserIds = triggerUsers.map(u => u.id)
    const userIdToEmail = new Map(triggerUsers.map(u => [u.id, u.email]))

    // 3. 답글 0개인 trigger 댓글 찾기 (최근 12시간)
    const triggerComments = await prisma.comment.findMany({
      where: {
        authorId: { in: triggerUserIds },
        createdAt: { gte: twelveHoursAgo },
        status: 'ACTIVE',
        // 답글이 없는 댓글 (parentId가 null = 최상위 댓글)
        parentId: null,
      },
      select: {
        id: true,
        content: true,
        authorId: true,
        postId: true,
        _count: { select: { replies: true } },
      },
      take: 20,
    })

    // 답글 0개인 것만 필터
    const noReplyComments = triggerComments.filter(c => c._count.replies === 0)

    if (noReplyComments.length === 0) {
      console.log('[COO] 대댓글 체인 대상 없음')
      await safeBotLog({ botType: 'COO', action: 'REPLY_CHAIN_DRIVE', status: 'SUCCESS', details: '답글 없는 trigger 댓글 없음', itemCount: 0, executionTimeMs: Date.now() - start })
      return
    }

    for (const comment of noReplyComments) {
      if (chainCount >= MAX_CHAINS_PER_RUN) break

      try {
        // trigger 페르소나 ID 역산
        const email = userIdToEmail.get(comment.authorId)
        if (!email) continue
        const personaMatch = email.match(/bot-(.+)@unao\.bot/)
        if (!personaMatch) continue
        const triggerPersonaId = personaMatch[1].toUpperCase()

        // 체인 조회
        const chains = getChainsForTrigger(triggerPersonaId)
        if (chains.length === 0) continue

        const chain = chains[Math.floor(Math.random() * chains.length)]

        // 게시글 제목 조회
        const post = await prisma.post.findUnique({
          where: { id: comment.postId },
          select: { title: true },
        })
        if (!post) continue

        // responders 순서대로 답글 생성 (maxDepth 제한)
        const parentCommentId = comment.id
        const respondersToUse = chain.responders.slice(0, chain.maxDepth - 1)

        for (const responderId of respondersToUse) {
          const responderUserId = await getBotUser(responderId)

          const replyText = await generateReply(responderId, post.title, comment.content)

          await prisma.comment.create({
            data: {
              postId: comment.postId,
              authorId: responderUserId,
              content: replyText,
              parentId: parentCommentId,
              status: 'ACTIVE',
            },
          })

          replyCount++
          console.log(`[COO] 대댓글 체인: ${triggerPersonaId} → ${responderId} (${chain.topic})`)
        }

        // 게시글 댓글 수 업데이트
        await prisma.post.update({
          where: { id: comment.postId },
          data: { commentCount: { increment: respondersToUse.length } },
        })

        chainCount++
      } catch (err) {
        console.error(`[COO] 체인 생성 실패 (comment ${comment.id}):`, err)
      }
    }

    const summary = `대댓글 체인 완료: ${chainCount}개 체인, ${replyCount}개 답글 생성`

    await safeBotLog({ botType: 'COO', action: 'REPLY_CHAIN_DRIVE', status: 'SUCCESS', details: summary, itemCount: replyCount, executionTimeMs: Date.now() - start })

    if (replyCount > 0) {
      await notifySlack({
        level: 'info',
        agent: 'COO',
        title: '대댓글 체인 생성',
        body: summary,
      })
    }

    console.log(`[COO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[COO] 대댓글 체인 실패:', errorMsg)

    await safeBotLog({ botType: 'COO', action: 'REPLY_CHAIN_DRIVE', status: 'FAILED', details: errorMsg, itemCount: 0, executionTimeMs: Date.now() - start })
  } finally {
    await disconnect()
  }
}

main()
