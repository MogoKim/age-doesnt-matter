import { prisma } from './db.js'

/** 실고객(진짜 카카오 가입자) = providerId 순수 숫자. 봇(seed/curate/bot-*)은 비숫자. */
const isRealUser = (pid: string | null | undefined): boolean => !!pid && /^\d+$/.test(pid)

/**
 * 봇이 실고객의 글에 댓글을 단 경우 → 글쓴이에게 종(bell) 알림 생성.
 *
 * - 글쓴이가 봇(providerId 비숫자)·비ACTIVE면 즉시 스킵 (봇은 알림 수신 금지).
 * - OS 푸시는 구독 funnel 복구(Bug#1) 이후 별도 연결 예정 — 현재는 종 알림만.
 * - 알림 실패가 댓글 게시 흐름에 영향 주지 않도록 throw 하지 않는다.
 *
 * agents/ → src/ 런타임 import 금지 규칙상 src의 notifyUser를 쓸 수 없어
 * 동일 규칙(isRealUser)을 여기서 재구현한다.
 */
export async function notifyAuthorOfBotComment(opts: {
  recipientUserId: string
  postId: string
  botUserId: string
}): Promise<void> {
  try {
    const recipient = (await prisma.user.findUnique({
      where: { id: opts.recipientUserId },
      select: { providerId: true, status: true },
    })) as { providerId: string | null; status: string } | null

    if (!recipient || recipient.status !== 'ACTIVE' || !isRealUser(recipient.providerId)) return

    const bot = (await prisma.user.findUnique({
      where: { id: opts.botUserId },
      select: { nickname: true },
    })) as { nickname: string | null } | null
    const nickname = bot?.nickname ?? '회원'

    await prisma.notification.create({
      data: {
        userId: opts.recipientUserId,
        type: 'COMMENT',
        content: `${nickname}님이 회원님의 글에 댓글을 남겼어요`,
        postId: opts.postId,
        fromUserId: opts.botUserId,
      },
    })
  } catch (e) {
    console.warn(`[notifyAuthor] 알림 생성 실패: ${String(e).slice(0, 80)}`)
  }
}
