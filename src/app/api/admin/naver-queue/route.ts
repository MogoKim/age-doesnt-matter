import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET — READY_FOR_MANUAL 항목 목록
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.naverBlogQueue.findMany({
    where: { status: 'READY_FOR_MANUAL' },
    orderBy: { targetTime: 'asc' },
  })

  const items = rows.map(r => ({
    queueId: r.queueId,
    title: r.title,
    category: r.category,
    targetTime: r.targetTime.toISOString(),
    status: r.status,
    imageUrls: r.imageUrls,
  }))

  return NextResponse.json({ items, total: items.length })
}

// DELETE — 발행 완료 후 항목 삭제
export async function DELETE(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { queueId?: string }
  const { queueId } = body

  if (!queueId) {
    return NextResponse.json({ error: 'queueId 필수' }, { status: 400 })
  }

  try {
    const deleted = await prisma.naverBlogQueue.delete({ where: { queueId } })
    return NextResponse.json({ ok: true, deleted: deleted.title })
  } catch {
    return NextResponse.json({ error: '항목 없음' }, { status: 404 })
  }
}
