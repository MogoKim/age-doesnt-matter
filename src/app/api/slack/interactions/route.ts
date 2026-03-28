/**
 * Slack Interactive Messages 핸들러
 *
 * Block Kit 버튼 클릭(승인/거절) 처리
 * - POST /api/slack/interactions
 * - application/x-www-form-urlencoded body에서 payload 필드 추출
 * - AdminQueue 상태 업데이트 + 원메시지 버튼 제거
 */
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? ''

// ── Slack 서명 검증 (기존 /api/slack/route.ts와 동일 로직) ──

function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
): boolean {
  if (!signature || !timestamp || !SLACK_SIGNING_SECRET) return false

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 300) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const hmac = crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex')
  const expectedSignature = `v0=${hmac}`

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  )
}

// ── Slack chat.update API 호출 ──

async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
): Promise<void> {
  if (!SLACK_BOT_TOKEN) return

  await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      ts,
      text,
      blocks: [],  // 버튼 제거 — 빈 blocks로 교체
    }),
  })
}

// ── 타입 정의 ──

interface SlackAction {
  action_id: string
  value: string
}

interface SlackUser {
  id: string
  username: string
  name: string
}

interface SlackChannel {
  id: string
  name: string
}

interface SlackMessage {
  ts: string
}

interface SlackContainer {
  message_ts: string
  channel_id: string
}

interface SlackInteractionPayload {
  type: string
  user: SlackUser
  actions: SlackAction[]
  channel: SlackChannel
  message: SlackMessage
  container: SlackContainer
}

// ── POST /api/slack/interactions ──

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-slack-signature')
    const timestamp = request.headers.get('x-slack-request-timestamp')

    // 서명 검증
    if (!verifySlackSignature(signature, timestamp, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // payload 필드 추출 (application/x-www-form-urlencoded)
    const params = new URLSearchParams(rawBody)
    const payloadStr = params.get('payload')

    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    const payload = JSON.parse(payloadStr) as SlackInteractionPayload

    // block_actions 타입만 처리
    if (payload.type !== 'block_actions') {
      return NextResponse.json({ ok: true })
    }

    const action = payload.actions[0]
    if (!action) {
      return NextResponse.json({ ok: true })
    }

    const itemId = action.value
    const actionId = action.action_id
    const userName = payload.user.name || payload.user.username

    if (actionId === 'approve' || actionId === 'reject') {
      const newStatus = actionId === 'approve' ? 'APPROVED' : 'REJECTED'
      const statusLabel = actionId === 'approve' ? '승인' : '거절'
      const statusEmoji = actionId === 'approve' ? '✅' : '❌'

      // AdminQueue 상태 업데이트
      const updated = await prisma.adminQueue.update({
        where: { id: itemId },
        data: {
          status: newStatus,
          resolvedBy: 'founder',
          resolvedAt: new Date(),
        },
      })

      // 원메시지 버튼 제거 + 결과 텍스트로 교체
      const kstTime = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      const resultText = `${statusEmoji} *${statusLabel}됨* — ${updated.title}\n처리자: ${userName} | 시각: ${kstTime}`

      const channelId = payload.channel?.id ?? payload.container?.channel_id
      const messageTs = payload.message?.ts ?? payload.container?.message_ts

      if (channelId && messageTs) {
        await updateSlackMessage(channelId, messageTs, resultText)
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Slack Interactions] Error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
