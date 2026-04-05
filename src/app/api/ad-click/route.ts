import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { adId?: string }
    if (!body.adId || typeof body.adId !== 'string') {
      return NextResponse.json({ error: 'adId required' }, { status: 400 })
    }

    const ad = await prisma.adBanner.findUnique({ where: { id: body.adId }, select: { id: true } })
    if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.adBanner.update({
      where: { id: body.adId },
      data: { clicks: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
