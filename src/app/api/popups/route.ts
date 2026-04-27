import { NextResponse, type NextRequest } from 'next/server'
import { getActivePopups, incrementPopupImpressions, incrementPopupClicks } from '@/lib/queries/popups'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/popups?path=/community — 현재 경로에 해당하는 활성 팝업 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') ?? '/'

  try {
    const popups = await getActivePopups(path)
    return NextResponse.json({ popups })
  } catch {
    return NextResponse.json({ popups: [] })
  }
}

/** POST /api/popups — 노출/클릭 이벤트 기록 */
export async function POST(req: NextRequest) {
  try {
    const rl = await checkApiRateLimit(req, 'popup-event', { max: 30 })
    if (rl) return rl

    const body = await req.json() as { popupId: string; event: string }
    const { popupId, event } = body

    if (!popupId || !event) {
      return NextResponse.json({ error: 'Missing popupId or event' }, { status: 400 })
    }

    // event 값 검증
    if (event !== 'impression' && event !== 'click') {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    // popupId 존재 여부 검증
    const popup = await prisma.popup.findUnique({ where: { id: popupId }, select: { id: true } })
    if (!popup) {
      return NextResponse.json({ error: 'Popup not found' }, { status: 404 })
    }

    if (event === 'impression') {
      await incrementPopupImpressions(popupId)
    } else {
      await incrementPopupClicks(popupId)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
