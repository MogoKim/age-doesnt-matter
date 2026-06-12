import { NextRequest, NextResponse } from 'next/server'
import { dispatchDuePushes } from '@/app/admin/(panel)/push/_dispatch'

// 예약 푸시 디스패치 — GHA 5분 크론이 x-cron-secret 헤더로 호출.
// VAPID 키가 Vercel(이 서버)에만 있으므로 발송은 여기서 수행.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await dispatchDuePushes()
  return NextResponse.json({ ok: true, ...result })
}
