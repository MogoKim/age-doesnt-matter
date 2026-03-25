import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { adId?: string }
    if (!body.adId || typeof body.adId !== 'string') {
      return NextResponse.json({ error: 'adId required' }, { status: 400 })
    }

    await prisma.adBanner.update({
      where: { id: body.adId },
      data: { clicks: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
