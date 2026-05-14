import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token')
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { postId?: string; authorId?: string }
  const { postId, authorId } = body

  if (!postId || !authorId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date()
  const queue = await prisma.userPostWaveQueue.create({
    data: {
      postId,
      authorId,
      wave1At: new Date(now.getTime() + 60_000),
      wave2At: new Date(now.getTime() + 600_000),
      wave3At: new Date(now.getTime() + 1_800_000),
      wave4At: new Date(now.getTime() + 3_600_000),
      expiresAt: new Date(now.getTime() + 86_400_000),
    },
  })

  return NextResponse.json({ id: queue.id }, { status: 201 })
}
