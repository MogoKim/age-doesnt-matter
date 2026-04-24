import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({
      installed: false,
      popupShownCount: 0,
      bannerDismissCount: 0,
      bannerLastDismissAt: null,
      bannerHiddenUntil: null,
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        pwaInstalled: true,
        pwaPopupShownCount: true,
        pwaBannerDismissCount: true,
        pwaBannerLastDismissAt: true,
        pwaBannerHiddenUntil: true,
      },
    })
    return NextResponse.json({
      installed: user?.pwaInstalled ?? false,
      popupShownCount: user?.pwaPopupShownCount ?? 0,
      bannerDismissCount: user?.pwaBannerDismissCount ?? 0,
      bannerLastDismissAt: user?.pwaBannerLastDismissAt?.toISOString() ?? null,
      bannerHiddenUntil: user?.pwaBannerHiddenUntil?.toISOString() ?? null,
    })
  } catch {
    return NextResponse.json({
      installed: false,
      popupShownCount: 0,
      bannerDismissCount: 0,
      bannerLastDismissAt: null,
      bannerHiddenUntil: null,
    })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let body: { action?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { action } = body
  const id = session.user.id

  try {
    if (action === 'installed') {
      await prisma.user.update({
        where: { id },
        data: { pwaInstalled: true, pwaInstalledAt: new Date() },
      })
      return new NextResponse(null, { status: 204 })
    }

    if (action === 'popup_shown') {
      await prisma.user.update({
        where: { id },
        data: {
          pwaPopupShownCount: { increment: 1 },
          pwaPopupLastShownAt: new Date(),
        },
      })
      return new NextResponse(null, { status: 204 })
    }

    if (action === 'banner_dismissed') {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { pwaBannerDismissCount: true, pwaBannerLastDismissAt: true },
      })
      const now = new Date()
      const consecutive =
        user?.pwaBannerLastDismissAt != null &&
        now.getTime() - user.pwaBannerLastDismissAt.getTime() <= 48 * 3600 * 1000

      const prevCount = user?.pwaBannerDismissCount ?? 0
      const newCount = consecutive ? prevCount + 1 : 1
      const hiddenUntil =
        newCount >= 2
          ? new Date(now.getTime() + 7 * 24 * 3600 * 1000)  // 7일
          : new Date(now.getTime() + 24 * 3600 * 1000)       // 24시간

      await prisma.user.update({
        where: { id },
        data: {
          pwaBannerDismissCount: newCount >= 2 ? 0 : newCount,  // 7일 진입 시 리셋
          pwaBannerLastDismissAt: now,
          pwaBannerHiddenUntil: hiddenUntil,
        },
      })
      return new NextResponse(null, { status: 204 })
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}
