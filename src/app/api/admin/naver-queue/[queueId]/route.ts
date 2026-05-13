import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { queueId: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.naverBlogQueue.findUnique({
    where: { queueId: params.queueId },
  })

  if (!row) return NextResponse.json({ error: '항목 없음' }, { status: 404 })

  const item = {
    queueId: row.queueId,
    magazinePostId: row.magazinePostId,
    title: row.title,
    category: row.category,
    targetTime: row.targetTime.toISOString(),
    status: row.status,
    naverBlogUrl: row.naverBlogUrl,
    retryCount: row.retryCount,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    queuedAt: row.queuedAt.toISOString(),
    expiredReason: row.expiredReason,
    transformedContent: row.transformedContent,
    imageUrls: row.imageUrls,
  }

  return NextResponse.json({ item })
}
