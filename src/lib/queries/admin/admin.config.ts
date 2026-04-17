import { prisma } from '@/lib/prisma'

// ─── 게시판 설정 ───

export async function getBoardConfigList() {
  return prisma.boardConfig.findMany({
    orderBy: { createdAt: 'asc' },
  })
}

export async function getBoardConfigById(id: string) {
  return prisma.boardConfig.findUnique({ where: { id } })
}
