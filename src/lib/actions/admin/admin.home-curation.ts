'use server'

import { revalidateTag, revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { BoardType } from '@/generated/prisma/client'

type SectionType = 'TRENDING' | 'STORIES' | 'HUMOR' | 'BEST_HOT' | 'BEST_FAME'
type ActionType = 'PIN' | 'HIDE'
export type DurationPreset = 'FOUR_HOURS' | 'EIGHT_HOURS' | 'TODAY' | 'MANUAL'

const BEST_SECTIONS: SectionType[] = ['BEST_HOT', 'BEST_FAME']

const SECTION_ALLOWED_BOARDS: Record<SectionType, BoardType[]> = {
  TRENDING:  ['STORY', 'LIFE2', 'HUMOR'] as BoardType[],
  STORIES:   ['STORY'] as BoardType[],
  HUMOR:     ['HUMOR'] as BoardType[],
  // 베스트 두 탭 모두 커뮤니티 3개 보드 대상 (best 쿼리와 동일)
  BEST_HOT:  ['STORY', 'LIFE2', 'HUMOR'] as BoardType[],
  BEST_FAME: ['STORY', 'LIFE2', 'HUMOR'] as BoardType[],
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

function revalidateCuration(section: SectionType) {
  // 오버라이드 변경은 어느 섹션이든 공유 태그 home-curation 으로 묶임
  revalidateTag('home-curation')

  if (BEST_SECTIONS.includes(section)) {
    revalidateTag('best-hot')
    revalidateTag('best-fame')
    revalidatePath('/best')
    revalidatePath('/admin/content/best')
    return
  }

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

    // 4. PIN position: 맨 위(1)에 삽입 — 기존 active PIN을 한 칸씩 뒤로 밀어 버튼('📌 맨 위 고정')과 일치시킨다.
    //    (과거 'pinCount+1=맨 뒤' 방식은 best가 이미 24개 PIN으로 차 있을 때 새 PIN이 position 25가 되어
    //     어드민 미리보기 24개 윈도우(composeBestHot limit:24)에서 잘려 "고정했는데 안 보이는" 버그였음)
    let position: number | null = input.position ?? null
    if (input.action === 'PIN' && position === null) {
      await tx.homeCurationOverride.updateMany({
        where: {
          section: input.section,
          action: 'PIN',
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { position: { increment: 1 } },
      })
      position = 1
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

  revalidateCuration(input.section)
}

export async function deactivateHomeCurationOverride(overrideId: string) {
  const admin = await requireAdmin()

  const override = await prisma.homeCurationOverride.findUnique({
    where: { id: overrideId },
    select: { postId: true, section: true, action: true },
  })
  if (!override) throw new Error('존재하지 않는 편성 설정입니다.')
  const overrideSection = override.section as SectionType

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

  revalidateCuration(overrideSection)
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

  revalidateCuration(section)
}

// ── 베스트 전용: 전체 순서 직접 관리 (24개 등 보이는 리스트 전체를 그 순서대로 고정) ──

/** 보이는 리스트 전체를 orderedPostIds 순서대로 PIN. 기존 PIN은 교체. 자동글이 섞인 리스트를 "이 순서로 잠금". */
export async function setBestPinOrder(
  section: SectionType,
  orderedPostIds: string[],
  duration: DurationPreset = 'MANUAL',
) {
  const admin = await requireAdmin()
  if (!BEST_SECTIONS.includes(section)) throw new Error('베스트 섹션만 전체 순서 관리가 가능합니다.')
  if (orderedPostIds.length === 0) return

  const expiresAt = calcExpiresAt(duration)

  // 배열형 트랜잭션(왕복 최소) — 24개 sequential create는 시드니 DB 왕복×24로
  // Prisma 인터랙티브 트랜잭션 타임아웃(5s)을 넘겨 롤백됨. createMany 1회로 대체.
  // deleteMany로 기존 PIN(active+inactive) 제거 → 재정렬 반복 시 inactive 누적 방지.
  await prisma.$transaction([
    prisma.homeCurationOverride.deleteMany({ where: { section, action: 'PIN' } }),
    prisma.homeCurationOverride.createMany({
      data: orderedPostIds.map((postId, i) => ({
        section,
        postId,
        action: 'PIN' as const,
        position: i + 1,
        expiresAt,
        createdByAdminId: admin.adminId,
      })),
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'HOME_CURATION_REORDER',
        targetType: 'POST',
        targetId: section,
        note: JSON.stringify({ section, orderedPostIds, bulk: true }),
      },
    }),
  ])

  revalidateCuration(section)
}

/** 베스트 섹션의 PIN(직접 관리) 전부 해제 → 자동 편성으로 복귀. HIDE는 유지. */
export async function clearBestPins(section: SectionType) {
  const admin = await requireAdmin()
  if (!BEST_SECTIONS.includes(section)) throw new Error('베스트 섹션만 가능합니다.')

  await prisma.$transaction([
    prisma.homeCurationOverride.deleteMany({ where: { section, action: 'PIN' } }),
    prisma.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'HOME_CURATION_CLEAR',
        targetType: 'POST',
        targetId: section,
        note: JSON.stringify({ section, clearedAllPins: true }),
      },
    }),
  ])

  revalidateCuration(section)
}
