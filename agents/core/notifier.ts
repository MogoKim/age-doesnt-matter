/**
 * Slack Notifier v2 — 6채널 통합 알림 시스템
 *
 * 14채널 → 6채널 재설계:
 *   DASHBOARD: 창업자 매일 확인 (critical + 브리핑 + 승인)
 *   REPORT: 주간 리포트 + KPI + 실험
 *   QA: 배포별 QA 결과 (스레드 기반)
 *   SYSTEM: CTO/CPO 시스템 알림
 *   LOG: 통합 운영 로그 (카테고리 prefix)
 *   AGENT: 에이전트 내부 협업
 */
import { WebClient } from '@slack/web-api'
import type { ChatPostMessageResponse } from '@slack/web-api'
import type { NotifyPayload } from './types.js'
import { prisma } from './db.js'

// ── Slack 클라이언트 ──
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? ''
const slack = SLACK_BOT_TOKEN ? new WebClient(SLACK_BOT_TOKEN) : null

// ── 채널 ID 매핑 (6채널) ──
const CHANNELS = {
  DASHBOARD: process.env.SLACK_CHANNEL_DASHBOARD ?? '',  // #대시보드
  REPORT: process.env.SLACK_CHANNEL_REPORT ?? '',        // #리포트
  QA: process.env.SLACK_CHANNEL_QA ?? '',                // #qa
  SYSTEM: process.env.SLACK_CHANNEL_SYSTEM ?? '',        // #시스템
  LOG: process.env.SLACK_CHANNEL_LOG ?? '',              // #로그
  AGENT: process.env.SLACK_CHANNEL_AGENT ?? '',          // #에이전트
} as const

type ChannelKey = keyof typeof CHANNELS

// ── Slack 설정 조기 검증 (프로덕션에서 누락 시 즉시 경고) ──
if (process.env.NODE_ENV === 'production') {
  const missingChannels = (Object.keys(CHANNELS) as ChannelKey[]).filter(
    (k) => !CHANNELS[k],
  )
  if (!SLACK_BOT_TOKEN || missingChannels.length > 0) {
    console.error('[Notifier] CRITICAL — Slack 설정 누락:', {
      token: SLACK_BOT_TOKEN ? '있음' : '없음 (SLACK_BOT_TOKEN 미설정)',
      missingChannels,
    })
  }
}

// ── 에이전트 → 로그 채널 매핑 ──
const AGENT_LOG_CHANNEL: Record<string, ChannelKey> = {
  COO: 'LOG',
  JOB: 'LOG',
  SEED: 'LOG',
  CMO: 'LOG',
  CFO: 'LOG',
  CDO: 'REPORT',
  CEO: 'DASHBOARD',
  CTO: 'SYSTEM',
  CPO: 'SYSTEM',
  CAFE_CRAWLER: 'LOG',
  STRATEGIST: 'LOG',
  COMMUNITY: 'LOG',
  QA: 'QA',
}

// ── 로그 카테고리 prefix (통합 #로그 채널용) ──
const LOG_PREFIX: Record<string, string> = {
  COO: '[운영]',
  JOB: '[일자리]',
  SEED: '[콘텐츠]',
  CMO: '[마케팅]',
  CFO: '[비용]',
}

// ── 심각도 → 채널 매핑 (이중 전송 제거!) ──
function resolveChannels(payload: NotifyPayload): ChannelKey[] {
  const channels: ChannelKey[] = []

  switch (payload.level) {
    case 'critical':
      channels.push('DASHBOARD')  // 1곳만! (기존: ALERT_URGENT + CEO_FOUNDER 2곳)
      break
    case 'important':
      channels.push('SYSTEM')
      break
    case 'info':
      break
  }

  const logChannel = AGENT_LOG_CHANNEL[payload.agent]
  if (logChannel && !channels.includes(logChannel)) {
    channels.push(logChannel)
  }

  if (channels.length === 0) {
    channels.push('LOG')
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
async function sendToSlack(
  channelKey: ChannelKey,
  text: string,
  blocks?: Record<string, unknown>[],
  threadTs?: string,
): Promise<ChatPostMessageResponse | null> {
  const channelId = CHANNELS[channelKey]
  if (!slack || !channelId) return null

  try {
    return await slack.chat.postMessage({
      channel: channelId,
      text,
      blocks: blocks as never,
      thread_ts: threadTs,
      unfurl_links: false,
    })
  } catch (err) {
    console.error(`[Slack] ${channelKey} 전송 실패:`, err)
    return null
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
 */
export async function notifySlack(payload: NotifyPayload): Promise<void> {
  if (!slack) {
    console.warn('[Notifier] Slack 설정 없음 — 콘솔 출력만')
    console.log(`[${payload.level}] ${payload.agent}: ${payload.title}\n${payload.body}`)
    return
  }

  const emoji = levelEmoji(payload.level)
  const channels = resolveChannels(payload)

  // 로그 채널이면 카테고리 prefix 추가
  const prefix = LOG_PREFIX[payload.agent] ?? ''
  const titleWithPrefix = prefix ? `${prefix} ${payload.title}` : payload.title

  const text = `${emoji} *${titleWithPrefix}*\n\n에이전트: ${payload.agent}\n${payload.body}`

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: titleWithPrefix, emoji: true },
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
    await notifySlack(payload)
  }
}

/**
 * AdminQueue 승인 요청 항목 타입
 */
interface ApprovalItem {
  id: string
  type: string
  title: string
  description?: string | null
  requestedBy: string
  botType?: string
}

/**
 * Slack #대시보드 채널에 Block Kit 승인 요청 메시지 전송
 */
export async function notifyApproval(item: ApprovalItem): Promise<void> {
  if (!slack || !CHANNELS.DASHBOARD) {
    const reason = !slack ? 'Slack 미설정' : 'DASHBOARD 채널 미설정'
    console.warn(`[Notifier] ${reason} — 승인 알림 스킵, BotLog에 기록`)
    // 폴백: BotLog에 기록 → 어드민 패널에서 확인 가능
    await prisma.botLog.create({
      data: {
        botType: item.botType ?? 'COO',
        status: 'FAILED',
        action: 'APPROVAL_REQUEST_UNSENT',
        details: JSON.stringify({ itemId: item.id, title: item.title, requestedBy: item.requestedBy, reason }),
      },
    }).catch((e) => console.error('[notifier] 폴백 DB 기록 실패:', e))
    return
  }

  const channelId = CHANNELS.DASHBOARD

  const kstTime = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const fallbackText = `[승인 요청] ${item.title} — ${item.requestedBy}`

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `승인 요청: ${item.title}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*유형:*\n${item.type}` },
        { type: 'mrkdwn', text: `*요청자:*\n${item.requestedBy}` },
      ],
    },
    ...(item.description
      ? [{
          type: 'section' as const,
          text: { type: 'mrkdwn' as const, text: `*미리보기:*\n${item.description.slice(0, 500)}` },
        }]
      : []),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '승인', emoji: true },
          style: 'primary',
          action_id: 'approve',
          value: item.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '거절', emoji: true },
          style: 'danger',
          action_id: 'reject',
          value: item.id,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `요청 시각: ${kstTime}` },
      ],
    },
  ]

  try {
    await slack.chat.postMessage({
      channel: channelId,
      text: fallbackText,
      blocks: blocks as never,
      unfurl_links: false,
    })
  } catch (err) {
    console.error('[Notifier] 승인 알림 전송 실패:', err)
  }
}

/**
 * QA 결과를 #qa 채널에 스레드로 전송
 *
 * 1. 부모 메시지 생성 (커밋 + 상태)
 * 2. 개별 결과를 스레드 답글로
 * 3. 최종 상태로 부모 업데이트
 * 4. 실패 시 #대시보드에 cross-post
 */
export interface QaReportOptions {
  commitSha: string
  results: Array<{ name: string; passed: boolean; detail: string }>
  analysis?: string
}

export async function sendQaReport(opts: QaReportOptions): Promise<void> {
  if (!slack) {
    console.warn('[Notifier] Slack 설정 없음 — QA 리포트 스킵')
    return
  }

  const kstTime = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const shortSha = opts.commitSha.slice(0, 7)
  const allPassed = opts.results.every((r) => r.passed)
  const statusEmoji = allPassed ? ':white_check_mark:' : ':x:'
  const statusText = allPassed ? 'QA 통과' : 'QA 실패'

  // Step 1: 부모 메시지
  const parentText = `${statusEmoji} 배포 QA — ${shortSha} (${kstTime})`
  const parentBlocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `배포 QA — ${shortSha}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*커밋:*\n\`${shortSha}\`` },
        { type: 'mrkdwn', text: `*상태:*\n${statusEmoji} ${statusText}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: opts.results.map((r) =>
          `${r.passed ? ':white_check_mark:' : ':x:'} ${r.name}`
        ).join('\n'),
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: kstTime },
      ],
    },
  ]

  const parentMsg = await sendToSlack('QA', parentText, parentBlocks)
  const threadTs = parentMsg?.ts

  // Step 2: 개별 결과를 스레드로
  if (threadTs) {
    for (const result of opts.results) {
      const emoji = result.passed ? ':white_check_mark:' : ':x:'
      await sendToSlack('QA', `${emoji} ${result.name}\n${result.detail}`, undefined, threadTs)
    }

    // 분석 결과도 스레드로
    if (opts.analysis) {
      await sendToSlack('QA', `:mag: AI 분석\n${opts.analysis}`, undefined, threadTs)
    }
  }

  // Step 3: 실패 시 #대시보드에 cross-post
  if (!allPassed) {
    const failedItems = opts.results.filter((r) => !r.passed)
    const crossPostText = `:x: 배포 QA 실패 — \`${shortSha}\`\n실패: ${failedItems.map((f) => f.name).join(', ')}\n상세는 #qa 채널 확인`
    await sendToSlack('DASHBOARD', crossPostText)
  } else {
    await sendToSlack('DASHBOARD', `:white_check_mark: 배포 QA 통과 — \`${shortSha}\``)
  }
}

/** 채널 키 목록 내보내기 (다른 모듈에서 사용) */
export type { ChannelKey }
export { CHANNELS }
