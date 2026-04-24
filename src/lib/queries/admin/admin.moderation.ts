import { prisma } from '@/lib/prisma'
import type { AdminQueueStatus, BannedWordCategory, ReportStatus } from '@/generated/prisma/client'

// ─── 신고 관리 ───

export interface ReportListOptions {
  status?: ReportStatus
  cursor?: string
  limit?: number
}

export async function getReportList(options: ReportListOptions = {}) {
  const { status, cursor, limit = 20 } = options

  const where = {
    ...(status ? { status } : { status: 'PENDING' as const }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      reason: true,
      description: true,
      status: true,
      action: true,
      createdAt: true,
      processedAt: true,
      reporter: {
        select: { id: true, nickname: true },
      },
      post: {
        select: { id: true, title: true, boardType: true },
      },
      comment: {
        select: { id: true, content: true },
      },
      processor: {
        select: { nickname: true },
      },
    },
  })

  const hasMore = reports.length > limit
  if (hasMore) reports.pop()

  return { reports, hasMore }
}

// ─── 금지어 ───

export interface BannedWordListOptions {
  category?: BannedWordCategory
  search?: string
  cursor?: string
  limit?: number
}

export async function getBannedWordList(options: BannedWordListOptions = {}) {
  const { category, search, cursor, limit = 30 } = options

  const where = {
    ...(category && { category }),
    ...(search && { word: { contains: search, mode: 'insensitive' as const } }),
    ...(cursor && { createdAt: { lt: new Date(cursor) } }),
  }

  const words = await prisma.bannedWord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = words.length > limit
  if (hasMore) words.pop()

  return { words, hasMore }
}

// ─── AdminQueue ───

export async function getAdminQueue(status?: AdminQueueStatus) {
  return prisma.adminQueue.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function getAdminQueueCounts() {
  const [pending, approved, rejected, expired] = await Promise.all([
    prisma.adminQueue.count({ where: { status: 'PENDING' } }),
    prisma.adminQueue.count({ where: { status: 'APPROVED' } }),
    prisma.adminQueue.count({ where: { status: 'REJECTED' } }),
    prisma.adminQueue.count({ where: { status: 'EXPIRED' } }),
  ])
  return { pending, approved, rejected, expired }
}
