import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token')
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { postId?: string; cafePostId?: string; authorPersonaId?: string }
  const { postId, cafePostId, authorPersonaId } = body

  if (!postId || !cafePostId || !authorPersonaId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date()
  const queue = await prisma.commentWaveQueue.create({
    data: {
      postId,
      cafePostId,
      authorPersonaId,
      wave1At: new Date(now.getTime() + 60_000),        // +1분
      wave2At: new Date(now.getTime() + 300_000),       // +5분
      wave3At: new Date(now.getTime() + 1_800_000),     // +30분
      wave4At: new Date(now.getTime() + 3_600_000),     // +60분
      expiresAt: new Date(now.getTime() + 216_000_000), // +60시간
    },
  })

  return NextResponse.json({ id: queue.id }, { status: 201 })
}
