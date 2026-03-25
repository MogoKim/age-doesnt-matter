/**
 * Slack Notifier — 에이전트 알림 시스템
 *
 * Telegram → Slack 전환 (2026-03-25 결정)
 * 13개 채널에 심각도/에이전트별 라우팅
 */
import { WebClient } from '@slack/web-api'
import type { NotifyPayload } from './types.js'
import { prisma } from './db.js'

// ── Slack 클라이언트 ──
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? ''
const slack = SLACK_BOT_TOKEN ? new WebClient(SLACK_BOT_TOKEN) : null

// ── 채널 ID 매핑 (환경변수에서 로드) ──
const CHANNELS = {
  // 창업자 전용
  CEO_FOUNDER: process.env.SLACK_CHANNEL_CEO_FOUNDER ?? '',        // #ceo-창업자
  DAILY_BRIEFING: process.env.SLACK_CHANNEL_DAILY_BRIEFING ?? '',  // #일일-브리핑
  WEEKLY_REPORT: process.env.SLACK_CHANNEL_WEEKLY_REPORT ?? '',    // #주간-리포트

  // 에이전트 협업
  AGENT_MEETING: process.env.SLACK_CHANNEL_AGENT_MEETING ?? '',    // #에이전트-회의실
  MEETING_LOG: process.env.SLACK_CHANNEL_MEETING_LOG ?? '',        // #회의록

  // 알림 (심각도별)
  ALERT_URGENT: process.env.SLACK_CHANNEL_ALERT_URGENT ?? '',      // #알림-긴급
  ALERT_SYSTEM: process.env.SLACK_CHANNEL_ALERT_SYSTEM ?? '',      // #알림-시스템
  ALERT_KPI: process.env.SLACK_CHANNEL_ALERT_KPI ?? '',            // #알림-kpi

  // 자동화 로그
  LOG_JOBS: process.env.SLACK_CHANNEL_LOG_JOBS ?? '',              // #로그-일자리
  LOG_CONTENT: process.env.SLACK_CHANNEL_LOG_CONTENT ?? '',        // #로그-콘텐츠
  LOG_MARKETING: process.env.SLACK_CHANNEL_LOG_MARKETING ?? '',    // #로그-마케팅
  LOG_COST: process.env.SLACK_CHANNEL_LOG_COST ?? '',              // #로그-비용

  // 성장
  EXPERIMENT: process.env.SLACK_CHANNEL_EXPERIMENT ?? '',           // #실험-보드
} as const

type ChannelKey = keyof typeof CHANNELS

// ── 에이전트 → 로그 채널 매핑 ──
const AGENT_LOG_CHANNEL: Record<string, ChannelKey> = {
  COO: 'LOG_JOBS',
  JOB: 'LOG_JOBS',
  SEED: 'LOG_CONTENT',
  CMO: 'LOG_MARKETING',
  CFO: 'LOG_COST',
  CDO: 'ALERT_KPI',
  CEO: 'CEO_FOUNDER',
  CTO: 'ALERT_SYSTEM',
  CPO: 'ALERT_SYSTEM',
}

// ── 심각도 → 채널 매핑 ──
function resolveChannels(payload: NotifyPayload): ChannelKey[] {
  const channels: ChannelKey[] = []

  // 심각도별 알림 채널
  switch (payload.level) {
    case 'critical':
      channels.push('ALERT_URGENT')
      channels.push('CEO_FOUNDER')  // critical은 창업자에게도
      break
    case 'important':
      channels.push('ALERT_SYSTEM')
      break
    case 'info':
      // info는 에이전트별 로그 채널에만
      break
  }

  // 에이전트별 로그 채널 추가
  const logChannel = AGENT_LOG_CHANNEL[payload.agent]
  if (logChannel && !channels.includes(logChannel)) {
    channels.push(logChannel)
  }

  // 채널이 비면 기본값
  if (channels.length === 0) {
    channels.push('ALERT_SYSTEM')
  }

  return channels
}

// ── 레벨 이모지 ──
function levelEmoji(level: NotifyPayload['level']): string {
  switch (level) {
    case 'critical': return ':red_circle:'
    case 'important': return ':large_orange_circle:'
    case 'info': return ':large_green_circle:'
  }
}

/**
 * Slack 채널로 메시지 전송
 */
async function sendToSlack(channelKey: ChannelKey, text: string, blocks?: Record<string, unknown>[]): Promise<void> {
  const channelId = CHANNELS[channelKey]
  if (!slack || !channelId) return

  try {
    await slack.chat.postMessage({
      channel: channelId,
      text,
      blocks: blocks as never,
      unfurl_links: false,
    })
  } catch (err) {
    console.error(`[Slack] ${channelKey} 전송 실패:`, err)
  }
}

/**
 * 특정 채널에 직접 메시지 전송 (커스텀 라우팅)
 */
export async function sendSlackMessage(
  channelKey: ChannelKey,
  text: string,
  blocks?: Record<string, unknown>[],
): Promise<void> {
  await sendToSlack(channelKey, text, blocks)
}

/**
 * Slack 알림 전송 — 심각도 + 에이전트별 자동 라우팅
 *
 * 기존 notifyTelegram() 대체
 */
export async function notifySlack(payload: NotifyPayload): Promise<void> {
  if (!slack) {
    console.warn('[Notifier] Slack 설정 없음 — 콘솔 출력만')
    console.log(`[${payload.level}] ${payload.agent}: ${payload.title}\n${payload.body}`)
    return
  }

  const emoji = levelEmoji(payload.level)
  const channels = resolveChannels(payload)
  const text = `${emoji} *${payload.title}*\n\n에이전트: ${payload.agent}\n${payload.body}`

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${payload.title}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*에이전트:*\n${payload.agent}` },
        { type: 'mrkdwn', text: `*심각도:*\n${emoji} ${payload.level}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: payload.body },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` },
      ],
    },
  ]

  await Promise.all(
    channels.map((ch) => sendToSlack(ch, text, blocks)),
  )
}

/**
 * 어드민 대시보드 알림 (DB 저장 + Slack 라우팅)
 *
 * 기존 notifyAdmin() 유지 — 내부적으로 Telegram → Slack 전환
 */
export async function notifyAdmin(payload: NotifyPayload): Promise<void> {
  // critical/important는 Slack에도 전송
  if (payload.level === 'critical' || payload.level === 'important') {
    await notifySlack(payload)
  }

  try {
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
        type: 'SYSTEM' as const,
        content: `[${payload.agent}] ${payload.title}\n${payload.body}`,
      })),
    })
  } catch (err) {
    console.error('[Notifier] 어드민 알림 저장 실패:', err)
    // 폴백: Slack으로 전송
    await notifySlack(payload)
  }
}

/** 채널 키 목록 내보내기 (다른 모듈에서 사용) */
export type { ChannelKey }
export { CHANNELS }
