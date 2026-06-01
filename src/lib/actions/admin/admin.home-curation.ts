'use server'

import { revalidateTag, revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { BoardType } from '@/generated/prisma/client'

type SectionType = 'TRENDING' | 'STORIES' | 'HUMOR'
type ActionType = 'PIN' | 'HIDE'
export type DurationPreset = 'FOUR_HOURS' | 'EIGHT_HOURS' | 'TODAY' | 'MANUAL'

const SECTION_ALLOWED_BOARDS: Record<SectionType, BoardType[]> = {
  TRENDING: ['STORY', 'LIFE2', 'HUMOR'] as BoardType[],
  STORIES:  ['STORY'] as BoardType[],
  HUMOR:    ['HUMOR'] as BoardType[],
}

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// KST 오늘 23:59:59 = UTC 14:59:59 (UTC+9)
function calcExpiresAt(duration: DurationPreset): Date | null {
  const now = new Date()
  if (duration === 'FOUR_HOURS') return new Date(now.getTime() + 4 * 60 * 60 * 1000)
  if (duration === 'EIGHT_HOURS') return new Date(now.getTime() + 8 * 60 * 60 * 1000)
  if (duration === 'TODAY') {
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const kstEnd = new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 14, 59, 59),
    )
    return kstEnd <= now ? new Date(kstEnd.getTime() + 24 * 60 * 60 * 1000) : kstEnd
  }
  return null // MANUAL = 수동 해제 시까지
}

function revalidateHome() {
  revalidateTag('home-curation')
  revalidateTag('home-trending')
  revalidateTag('home-stories')
  revalidateTag('home-humor')
  revalidatePath('/')
  revalidatePath('/admin/content/home')
}

export interface CreateOverrideInput {
  section: SectionType
  postId: string
  action: ActionType
  position?: number | null
  duration: DurationPreset
  note?: string | null
}

export async function createHomeCurationOverride(input: CreateOverrideInput) {
  const admin = await requireAdmin()

  await prisma.$transaction(async tx => {
    // 1. post 조회 및 검증 — 기존 override 건드리기 전에 먼저 실행
    const post = await tx.post.findUnique({
      where: { id: input.postId },
      select: { boardType: true, status: true },
    })
    if (!post) throw new Error('존재하지 않는 게시글입니다.')

    const allowedBoards = SECTION_ALLOWED_BOARDS[input.section]
    if (!allowedBoards.includes(post.boardType)) {
      throw new Error(
        `이 섹션에서 허용되지 않는 게시판 유형입니다. (허용: ${allowedBoards.join(', ')})`,
      )
    }
    if ((post.status as string) !== 'PUBLISHED') {
      throw new Error('공개된 게시글만 편성할 수 있습니다.')
    }

    const now = new Date()
    const expiresAt = calcExpiresAt(input.duration)

    // 2. 운영 활성 override 조회 (expired row 제외)
    const activeOverrides = await tx.homeCurationOverride.findMany({
      where: {
        section: input.section,
        postId: input.postId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })

    // 3. 각 row 비활성화 + HOME_CURATION_REPLACE 감사 로그 (before 값 보존)
    for (const prev of activeOverrides) {
      await tx.homeCurationOverride.update({
        where: { id: prev.id },
        data: { isActive: false },
      })
      await tx.adminAuditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'HOME_CURATION_REPLACE',
          targetType: 'POST',
          targetId: input.postId,
          note: JSON.stringify({
            section: input.section,
            replacedId: prev.id,
            before: {
              action: prev.action,
              position: prev.position,
              expiresAt: prev.expiresAt,
            },
          }),
        },
      })
    }

    // 4. PIN position: operationally active PIN만 count
    let position: number | null = input.position ?? null
    if (input.action === 'PIN' && position === null) {
      const pinCount = await tx.homeCurationOverride.count({
        where: {
          section: input.section,
          action: 'PIN',
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })
      position = pinCount + 1
    }

    // 5. 신규 override insert
    await tx.homeCurationOverride.create({
      data: {
        section: input.section,
        postId: input.postId,
        action: input.action,
        position: input.action === 'PIN' ? position : null,
        expiresAt,
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
        note: JSON.stringify({
          section: input.section,
          position,
          expiresAt,
          duration: input.duration,
          note: input.note ?? null,
        }),
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

export async function searchCurationPostsAction(query: string, section: SectionType) {
  await requireAdmin()
  if (!query.trim()) return []

  const allowedBoards = SECTION_ALLOWED_BOARDS[section]

  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      title: { contains: query.trim(), mode: 'insensitive' },
      boardType: { in: allowedBoards },
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
    const now = new Date()
    for (let i = 0; i < orderedPostIds.length; i++) {
      await tx.homeCurationOverride.updateMany({
        where: {
          section,
          postId: orderedPostIds[i],
          action: 'PIN',
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
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
