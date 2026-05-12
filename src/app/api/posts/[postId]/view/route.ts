import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const rl = await checkApiRateLimit(req, 'post-view', { max: 60, windowMs: 60_000 })
  if (rl) return rl
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: true })

  const { postId } = await params
  const body = await req.json().catch(() => ({})) as { readPercent?: number }
  const readPercent = Math.min(100, Math.max(0, Number(body.readPercent ?? 0)))

  await prisma.postView.upsert({
    where: { userId_postId: { userId: session.user.id, postId } },
    create: { userId: session.user.id, postId, readPercent },
    update: {
      viewedAt: new Date(),
      readPercent,
    },
  })

  return NextResponse.json({ ok: true })
}
