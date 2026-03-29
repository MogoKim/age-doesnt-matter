import { NextResponse, type NextRequest } from 'next/server'
import { getActivePopups, incrementPopupImpressions, incrementPopupClicks } from '@/lib/queries/popups'

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
    const body = await req.json() as { popupId: string; event: 'impression' | 'click' }
    const { popupId, event } = body

    if (!popupId || !event) {
      return NextResponse.json({ error: 'Missing popupId or event' }, { status: 400 })
    }

    if (event === 'impression') {
      await incrementPopupImpressions(popupId)
    } else if (event === 'click') {
      await incrementPopupClicks(popupId)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
