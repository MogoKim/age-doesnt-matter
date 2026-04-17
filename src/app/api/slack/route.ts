/**
 * Slack Webhook 엔드포인트
 *
 * 1. Slack 슬래시 커맨드 수신 (application/x-www-form-urlencoded)
 * 2. 서명 검증 (Signing Secret)
 * 3. 커맨드 핸들러로 라우팅
 */
import { NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack-verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/slack — Slack 슬래시 커맨드 + 이벤트 수신
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-slack-signature')
    const timestamp = request.headers.get('x-slack-request-timestamp')

    // 서명 검증
    if (!verifySlackSignature(signature, timestamp, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') ?? ''

    // ── Slack 슬래시 커맨드 (form-urlencoded) ──
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody)
      const command = params.get('command') ?? ''
      const text = params.get('text') ?? ''

      // Slack URL Verification 없이 바로 처리할 수도 있지만
      // 3초 제한이 있으므로 빠른 응답 + 비동기 처리가 필요
      // 현재는 직접 응답 (대부분 DB 쿼리만이라 3초 내 가능)

      const { handleSlashCommand } = await import('@/lib/slack-commands')

      const result = await handleSlashCommand({
        command,
        text,
        user_id: params.get('user_id') ?? '',
        user_name: params.get('user_name') ?? '',
        channel_id: params.get('channel_id') ?? '',
        response_url: params.get('response_url') ?? '',
      })

      return NextResponse.json(result)
    }

    // ── Slack Events API (JSON) ──
    if (contentType.includes('application/json')) {
      const payload = JSON.parse(rawBody)

      // URL Verification Challenge
      if (payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge })
      }

      // 이벤트 처리 (향후 확장용)
      if (payload.type === 'event_callback') {
        // 현재는 이벤트 수신만 확인
        console.log('[Slack Event]', payload.event?.type)
        return NextResponse.json({ ok: true })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Slack Webhook] Error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
