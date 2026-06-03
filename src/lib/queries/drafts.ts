import 'server-only'
import { prisma } from '@/lib/prisma'

export async function getDraftSummariesByUserId(userId: string) {
  return prisma.draftPost.findMany({
    where: { authorId: userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      boardSlug: true,
      category: true,
      title: true,
      updatedAt: true,
    },
  })
}
