import type { NotifyPayload } from './types.js'
import { prisma } from './db.js'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

/** 텔레그램으로 긴급 알림 전송 */
export async function notifyTelegram(payload: NotifyPayload): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Notifier] 텔레그램 설정 없음 — 콘솔 출력만')
    console.log(`[${payload.level}] ${payload.agent}: ${payload.title}\n${payload.body}`)
    return
  }

  const emoji = payload.level === 'critical' ? '🔴' : payload.level === 'important' ? '🟠' : '🟢'
  const text = `${emoji} *${payload.title}*\n\n에이전트: ${payload.agent}\n${payload.body}`

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    })
  } catch (err) {
    console.error('[Notifier] 텔레그램 전송 실패:', err)
  }
}

/** 어드민 대시보드 알림 (DB 저장) */
export async function notifyAdmin(payload: NotifyPayload): Promise<void> {
  // critical은 텔레그램에도 전송
  if (payload.level === 'critical') {
    await notifyTelegram(payload)
  }

  try {
    // 어드민 유저에게 알림 생성
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    })

    if (admins.length === 0) {
      console.log(`[Admin] ${payload.title}: ${payload.body}`)
      return
    }

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'SYSTEM',
        title: `[${payload.agent}] ${payload.title}`,
        body: payload.body,
        linkUrl: '/admin/agents',
      })),
    })
  } catch (err) {
    console.error('[Notifier] 어드민 알림 저장 실패:', err)
    // 폴백: 텔레그램
    await notifyTelegram(payload)
  }
}
