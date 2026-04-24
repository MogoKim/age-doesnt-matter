import { prisma } from '@/lib/prisma'
import type { UserStatus } from '@/generated/prisma/client'

// ─── 회원 관리 ───

export interface MemberListOptions {
  status?: UserStatus
  search?: string
  cursor?: string
  limit?: number
  botOnly?: boolean
  hideBot?: boolean
}

export async function getMemberList(options: MemberListOptions = {}) {
  const { status, search, cursor, limit = 20, botOnly, hideBot } = options

  const where = {
    ...(status && { status }),
    ...(botOnly && { email: { endsWith: '@unao.bot' } }),
    ...(hideBot && {
      AND: [
        {
          OR: [
            { email: null },
            { NOT: { email: { endsWith: '@unao.bot' } } },
          ],
        },
        { NOT: { providerId: { startsWith: 'seed_' } } },
      ],
    }),
    ...(search && {
      OR: [
        { nickname: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      nickname: true,
      email: true,
      grade: true,
      status: true,
      isOnboarded: true,
      postCount: true,
      commentCount: true,
      receivedLikes: true,
      lastLoginAt: true,
      createdAt: true,
      birthYear: true,
      gender: true,
      providerId: true,
    },
  })

  const hasMore = users.length > limit
  if (hasMore) users.pop()

  return { users, hasMore }
}

export async function getMemberDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      email: true,
      profileImage: true,
      grade: true,
      status: true,
      birthYear: true,
      gender: true,
      regions: true,
      interests: true,
      postCount: true,
      commentCount: true,
      receivedLikes: true,
      suspendedUntil: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })
}
