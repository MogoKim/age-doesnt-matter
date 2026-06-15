import { prisma } from '@/lib/prisma'
import { WebClient } from '@slack/web-api'

const slack = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null

async function notifySlackCritical(title: string, body: string) {
  if (!slack) return
  const channel = process.env.SLACK_CHANNEL_DASHBOARD
  if (!channel) return
  await slack.chat.postMessage({
    channel,
    text: `🚨 *${title}*\n${body}`,
  }).catch(e => console.error('[auth-monitor] Slack 전송 실패:', e))
}

export type AuthFailureReason =
  | 'signin_exception'
  | 'jwt_exception'
  | 'oauth_callback_error'
  | 'gender_blocked'

export async function logAuthFailure(
  reason: AuthFailureReason,
  detail: string
): Promise<void> {
  // 'gender_blocked'는 여성 전용 정책에 따른 정상 차단(실패 아님).
  // status를 SKIP으로 기록해 아래 실패 급증(FAILED) Slack 카운트에서 제외한다.
  const isPolicyBlock = reason === 'gender_blocked'

  // 1. DB 기록 — 실패해도 auth 흐름 블로킹하지 않음
  await prisma.botLog.create({
    data: {
      botType: 'CTO',
      action: 'AUTH_FAILURE',
      status: isPolicyBlock ? 'SKIP' : 'FAILED',
      details: JSON.stringify({ reason, detail, ts: new Date().toISOString() }),
    },
  }).catch(e => console.error('[auth-monitor] DB 기록 실패:', e))

  // 정책적 차단은 '회원가입 실패 급증' 알림 대상이 아니므로 여기서 종료
  if (isPolicyBlock) return

  // 2. 최근 1시간 FAILED 3건 이상 → Slack #대시보드 CRITICAL
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const count = await prisma.botLog.count({
    where: {
      botType: 'CTO',
      action: 'AUTH_FAILURE',
      status: 'FAILED',
      createdAt: { gte: oneHourAgo },
    },
  }).catch(() => 0)

  if (count >= 3) {
    await notifySlackCritical(
      `회원가입 실패 급증 — ${count}건/1h`,
      `최근 원인: \`${reason}\`\n${detail.slice(0, 200)}\n→ Vercel 로그 확인 필요`
    )
  }
}
