'use server'

import { revalidateTag, revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'

type SectionType = 'TRENDING' | 'STORIES' | 'HUMOR'
type ActionType = 'PIN' | 'HIDE'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

function revalidateHome() {
  revalidateTag('home-curation')
  revalidateTag('home-trending')
  revalidateTag('home-stories')
  revalidateTag('home-humor')
  revalidatePath('/')
}

export interface CreateOverrideInput {
  section: SectionType
  postId: string
  action: ActionType
  position?: number | null
  expiresAt?: string | null
  note?: string | null
}

export async function createHomeCurationOverride(input: CreateOverrideInput) {
  const admin = await requireAdmin()

  await prisma.$transaction(async tx => {
    // 같은 (section, postId)의 기존 활성 override 비활성화
    await tx.homeCurationOverride.updateMany({
      where: { section: input.section, postId: input.postId, isActive: true },
      data: { isActive: false },
    })

    // PIN이고 position 미지정 시 마지막 순서 자동 배정
    let position: number | null = input.position ?? null
    if (input.action === 'PIN' && position === null) {
      const pinCount = await tx.homeCurationOverride.count({
        where: { section: input.section, action: 'PIN', isActive: true },
      })
      position = pinCount + 1
    }

    await tx.homeCurationOverride.create({
      data: {
        section: input.section,
        postId: input.postId,
        action: input.action,
        position: input.action === 'PIN' ? position : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        note: input.note ?? null,
        createdByAdminId: admin.adminId,
      },
    })

    const auditAction = input.action === 'PIN' ? 'HOME_CURATION_PIN' : 'HOME_CURATION_HIDE'
    await tx.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: auditAction,
        targetType: 'POST',
        targetId: input.postId,
        note: JSON.stringify({ section: input.section, position, note: input.note ?? null }),
      },
    })
  })

  revalidateHome()
}

export async function deactivateHomeCurationOverride(overrideId: string) {
  const admin = await requireAdmin()

  const override = await prisma.homeCurationOverride.findUnique({
    where: { id: overrideId },
    select: { postId: true, section: true, action: true },
  })
  if (!override) throw new Error('존재하지 않는 편성 설정입니다.')

  await prisma.$transaction([
    prisma.homeCurationOverride.update({
      where: { id: overrideId },
      data: { isActive: false },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'HOME_CURATION_CLEAR',
        targetType: 'POST',
        targetId: override.postId,
        note: JSON.stringify({ section: override.section, clearedAction: override.action }),
      },
    }),
  ])

  revalidateHome()
}

export async function searchCurationPostsAction(query: string) {
  await requireAdmin()
  if (!query.trim()) return []

  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      title: { contains: query.trim(), mode: 'insensitive' },
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
    },
    select: {
      id: true,
      title: true,
      boardType: true,
      thumbnailUrl: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  })

  return posts.map(p => ({
    id: p.id,
    title: p.title,
    boardType: p.boardType as string,
    thumbnailUrl: p.thumbnailUrl,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    createdAt: p.createdAt.toISOString(),
    authorNickname: p.author?.nickname ?? '탈퇴한 회원',
  }))
}

export async function reorderHomeCurationPin(
  section: SectionType,
  orderedPostIds: string[],
) {
  const admin = await requireAdmin()

  await prisma.$transaction(async tx => {
    for (let i = 0; i < orderedPostIds.length; i++) {
      await tx.homeCurationOverride.updateMany({
        where: { section, postId: orderedPostIds[i], action: 'PIN', isActive: true },
        data: { position: i + 1 },
      })
    }

    await tx.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'HOME_CURATION_REORDER',
        targetType: 'POST',
        targetId: section,
        note: JSON.stringify({ section, orderedPostIds }),
      },
    })
  })

  revalidateHome()
}
