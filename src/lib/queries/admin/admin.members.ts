import { prisma } from '@/lib/prisma'
import type { UserStatus } from '@/generated/prisma/client'

// ─── 회원 관리 ───

// 정렬 허용 컬럼(화이트리스트) — 임의 컬럼 정렬/인젝션 방지
export const MEMBER_SORT_FIELDS = [
  'postCount',
  'commentCount',
  'receivedLikes',
  'lastLoginAt',
  'createdAt',
] as const
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number]
export type SortOrder = 'asc' | 'desc'

export interface MemberListOptions {
  status?: UserStatus
  search?: string
  page?: number
  limit?: number
  botOnly?: boolean
  hideBot?: boolean
  sort?: string
  order?: string
}

export async function getMemberList(options: MemberListOptions = {}) {
  const { status, search, page = 1, limit = 20, botOnly, hideBot } = options

  // 화이트리스트 검증 — 허용 외 값은 기본값으로 강제
  const sort: MemberSortField = MEMBER_SORT_FIELDS.includes(options.sort as MemberSortField)
    ? (options.sort as MemberSortField)
    : 'createdAt'
  const order: SortOrder = options.order === 'asc' ? 'asc' : 'desc'
  const currentPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1

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
  }

  const users = await prisma.user.findMany({
    where,
    // 동점 시 id로 안정 정렬(tie-breaker) — 페이지 경계 중복/누락 방지
    orderBy: [{ [sort]: order }, { id: 'desc' }],
    skip: (currentPage - 1) * limit,
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

  return { users, hasMore, page: currentPage, sort, order }
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
