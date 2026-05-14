'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'

function computeLevel(
  score: number,
  hotThreshold: number,
  fameThreshold: number,
): PromotionLevel {
  if (score >= fameThreshold) return 'HALL_OF_FAME'
  if (score >= hotThreshold) return 'HOT'
  return 'NORMAL'
}

/**
 * 좋아요·댓글 변경 후 게시글 승격 레벨을 자동 재계산.
 * BoardConfig를 직접 조회(캐시 우회)하여 실시간 임계값 보장.
 * 승격(NORMAL→HOT, *→HALL_OF_FAME)일 때만 작성자 알림 생성.
 */
export async function checkAndPromotePost(
  postId: string,
  boardType: BoardType,
  likeCount: number,
  commentCount: number,
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { promotionLevel: true, authorId: true, hotPromotedAt: true },
  })
  if (!post) return

  const boardConfig = await prisma.boardConfig
    .findUnique({
      where: { boardType },
      select: { hotThreshold: true, fameThreshold: true },
    })
    .catch(() => null)

  const hotThreshold = boardConfig?.hotThreshold ?? 10
  const fameThreshold = boardConfig?.fameThreshold ?? 30
  const newLevel = computeLevel(likeCount + commentCount, hotThreshold, fameThreshold)

  if (post.promotionLevel === newLevel) return

  // hotPromotedAt은 최초 HOT/HALL_OF_FAME 달성 시각을 영구 기록한다.
  // 재승격·강등 어떤 경우에도 덮어쓰지 않는다.
  // 이 불변성이 "뜨는 이야기" 영구 잔류 구조의 근거.
  await prisma.post.update({
    where: { id: postId },
    data: {
      promotionLevel: newLevel,
      ...(newLevel !== 'NORMAL' && !post.hotPromotedAt
        ? { hotPromotedAt: new Date() }
        : {}),
    },
  })

  const isPromotion =
    (post.promotionLevel === 'NORMAL' && newLevel !== 'NORMAL') ||
    (post.promotionLevel === 'HOT' && newLevel === 'HALL_OF_FAME')

  if (isPromotion) {
    await prisma.notification
      .create({
        data: {
          userId: post.authorId,
          type: newLevel === 'HALL_OF_FAME' ? 'HALL_OF_FAME' : 'HOT_POST',
          content:
            newLevel === 'HALL_OF_FAME'
              ? '작성하신 글이 명예의 전당에 올랐어요! 👑'
              : '작성하신 글이 뜨는 글에 선정됐어요! 🔥',
          postId,
        },
      })
      .catch(() => {})
  }

  revalidatePath('/best')
}

/**
 * 어드민 임계값 변경 시 해당 게시판 전체 게시글을 즉시 재평가.
 * 승격만 알림, 강등은 알림 없음.
 */
export async function retroactivePromotionUpdate(
  boardType: BoardType,
  hotThreshold: number,
  fameThreshold: number,
): Promise<{ updated: number; promoted: number }> {
  const posts = await prisma.post.findMany({
    where: { boardType, status: 'PUBLISHED' },
    select: {
      id: true,
      likeCount: true,
      commentCount: true,
      promotionLevel: true,
      authorId: true,
      hotPromotedAt: true,
    },
  })

  const toUpdate: {
    id: string
    newLevel: PromotionLevel
    oldLevel: PromotionLevel
    authorId: string
    hotPromotedAt: Date | null
  }[] = []

  for (const post of posts) {
    const newLevel = computeLevel(post.likeCount + post.commentCount, hotThreshold, fameThreshold)
    if (newLevel !== post.promotionLevel) {
      toUpdate.push({ id: post.id, newLevel, oldLevel: post.promotionLevel, authorId: post.authorId, hotPromotedAt: post.hotPromotedAt })
    }
  }

  if (toUpdate.length === 0) return { updated: 0, promoted: 0 }

  // hotPromotedAt 불변성 규칙: 최초 HOT/HALL_OF_FAME 달성 시각 영구 보존.
  // 재승격·강등 어떤 경우에도 덮어쓰지 않는다.
  await prisma.$transaction(
    toUpdate.map(({ id, newLevel, hotPromotedAt }) =>
      prisma.post.update({
        where: { id },
        data: {
          promotionLevel: newLevel,
          ...(newLevel !== 'NORMAL' && !hotPromotedAt
            ? { hotPromotedAt: new Date() }
            : {}),
        },
      }),
    ),
  )

  const promoted = toUpdate.filter(
    ({ oldLevel, newLevel }) =>
      (oldLevel === 'NORMAL' && newLevel !== 'NORMAL') ||
      (oldLevel === 'HOT' && newLevel === 'HALL_OF_FAME'),
  )

  if (promoted.length > 0) {
    await prisma.notification
      .createMany({
        data: promoted.map(({ id: postId, newLevel, authorId }) => ({
          userId: authorId,
          type: newLevel === 'HALL_OF_FAME' ? ('HALL_OF_FAME' as const) : ('HOT_POST' as const),
          content:
            newLevel === 'HALL_OF_FAME'
              ? '작성하신 글이 명예의 전당에 올랐어요! 👑'
              : '작성하신 글이 뜨는 글에 선정됐어요! 🔥',
          postId,
        })),
        skipDuplicates: true,
      })
      .catch(() => {})
  }

  revalidatePath('/best')
  return { updated: toUpdate.length, promoted: promoted.length }
}
