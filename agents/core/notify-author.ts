import { prisma } from './db.js'

/** 실고객(진짜 카카오 가입자) = providerId 순수 숫자. 봇(seed/curate/bot-*)은 비숫자. */
const isRealUser = (pid: string | null | undefined): boolean => !!pid && /^\d+$/.test(pid)

/**
 * 보드 → URL 접두사. src/lib/board-registry가 SSoT지만 agents→src 런타임 import 금지라
 * 여기서 재정의한다(agents/coo/author-reply-driver.ts BOARD_URL_PREFIX_LOCAL과 동일 관례).
 * 봇 댓글이 달리는 회원 글 보드만 둔다 — 그 밖은 앵커 없이 기존 동작.
 */
const BOARD_URL_PREFIX_LOCAL: Record<string, string> = {
  STORY: '/community/stories',
  LIFE2: '/community/life2',
  HUMOR: '/community/humor',
  MENOPAUSE: '/community/menopause',
}

/**
 * 알림 클릭 시 이동할 경로. 봇 댓글 위치(#comment-{id})까지 지정해
 * 글 상단이 아니라 "달린 댓글"이 바로 보이게 한다(리텐션 루프).
 * - slug가 있으면 canonical slug 사용(CUID→slug 301/308 왕복 제거).
 * - 보드 매핑이 없거나 댓글 id가 없으면 null → 기존 동작(postId 기반 글 URL).
 * author-reply-driver.buildAuthorReplyLinkUrl · src buildCommentAnchorUrl과 동일 출력 규격.
 */
function buildBotCommentLinkUrl(i: {
  boardType: string
  postSlug: string | null
  postId: string
  commentId: string | null
}): string | null {
  const prefix = BOARD_URL_PREFIX_LOCAL[i.boardType]
  if (!prefix || !i.commentId) return null
  return `${prefix}/${i.postSlug ?? i.postId}#comment-${i.commentId}`
}

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
  /** 방금 단 봇 댓글 id. 있으면 알림 linkUrl에 #comment-{id} 앵커를 넣는다. 없으면 기존 동작. */
  commentId?: string | null
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

    // 앵커 URL — commentId가 있을 때만 post를 1건 더 읽는다(없으면 조회조차 하지 않는다).
    // prisma는 Record<string, unknown>이라 모델 직접 접근 시 TS18046이 난다.
    // ops-typecheck는 파일별 오류 '증가'를 실패로 보므로 최소 형태로 캐스팅해 회귀를 만들지 않는다.
    let linkUrl: string | null = null
    if (opts.commentId) {
      const db = prisma as unknown as {
        post: { findUnique(args: unknown): Promise<{ boardType: string; slug: string | null } | null> }
      }
      const post = await db.post.findUnique({
        where: { id: opts.postId },
        select: { boardType: true, slug: true },
      })
      if (post) {
        linkUrl = buildBotCommentLinkUrl({
          boardType: post.boardType,
          postSlug: post.slug,
          postId: opts.postId,
          commentId: opts.commentId,
        })
      }
    }

    await prisma.notification.create({
      data: {
        userId: opts.recipientUserId,
        type: 'COMMENT',
        content: `${nickname}님이 회원님의 글에 댓글을 남겼어요`,
        postId: opts.postId,
        fromUserId: opts.botUserId,
        // 앵커를 못 만들면 넣지 않는다 → 조회 시 postId 기반 글 URL로 기존 동작 유지.
        ...(linkUrl ? { linkUrl } : {}),
      },
    })
  } catch (e) {
    console.warn(`[notifyAuthor] 알림 생성 실패: ${String(e).slice(0, 80)}`)
  }
}
