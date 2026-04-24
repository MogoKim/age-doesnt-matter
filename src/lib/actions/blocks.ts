'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface BlockResult {
  error?: string
  blocked?: boolean
}

export async function toggleUserBlock(blockedUserId: string): Promise<BlockResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const userId = session.user.id

  if (userId === blockedUserId) {
    return { error: '본인을 차단할 수 없습니다' }
  }

  const existing = await prisma.userBlock.findUnique({
    where: { userId_blockedUserId: { userId, blockedUserId } },
  })

  if (existing) {
    await prisma.userBlock.delete({ where: { id: existing.id } })
    revalidatePath('/community')
    return { blocked: false }
  }

  await prisma.userBlock.create({
    data: { userId, blockedUserId },
  })
  revalidatePath('/community')
  return { blocked: true }
}

/** 내가 차단한 사용자 목록 */
export async function getMyBlockedUsers(): Promise<{
  error?: string
  users?: Array<{ id: string; nickname: string; blockedAt: string }>
}> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const blocks = await prisma.userBlock.findMany({
    where: { userId: session.user.id },
    select: {
      blocked: { select: { id: true, nickname: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return {
    users: blocks.map((b) => ({
      id: b.blocked.id,
      nickname: b.blocked.nickname,
      blockedAt: b.createdAt.toISOString(),
    })),
  }
}
