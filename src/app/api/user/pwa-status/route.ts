import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ installed: false })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pwaInstalled: true },
    })
    return NextResponse.json({ installed: user?.pwaInstalled ?? false })
  } catch {
    // DB migration 전 graceful fallback
    return NextResponse.json({ installed: false })
  }
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        pwaInstalled: true,
        pwaInstalledAt: new Date(),
      },
    })
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}
