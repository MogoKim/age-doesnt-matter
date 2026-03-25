/**
 * Slack Commander — 모바일 커맨드 인터페이스
 *
 * Telegram Commander 대체 (2026-03-25)
 * Slack 슬래시 커맨드 + 인터랙티브 버튼으로 시스템 관리
 *
 * 슬래시 커맨드:
 *   /una-status     — 현재 KPI 요약 (DAU, 게시글, 수익)
 *   /una-agents     — 에이전트 상태 (마지막 실행, 성공/실패)
 *   /una-cost       — 이번 달 비용 현황
 *   /una-jobs       — 오늘 일자리 수집 현황
 *   /una-trend      — 오늘의 5060 트렌드
 *   /una-cafe       — 카페 크롤링 현황
 *   /una-approve N  — 어드민 큐 항목 승인
 *   /una-reject N   — 어드민 큐 항목 거절
 *   /una-stop       — 전체 자동화 긴급 중지
 *   /una-kpi        — KPI 대시보드 요약
 *   /una-meeting    — 에이전트 긴급 회의 소집
 *   /help           — 명령어 목록
 */

import { prisma } from './db.js'
import { sendSlackMessage } from './notifier.js'

// ── 타입 ──
export interface SlackSlashCommand {
  command: string
  text: string          // 커맨드 뒤 텍스트 (예: /approve 3 → "3")
  user_id: string
  user_name: string
  channel_id: string
  response_url: string
}

export interface SlackCommandResult {
  response_type: 'in_channel' | 'ephemeral'
  text: string
  blocks?: Record<string, unknown>[]
}

// ── 핸들러 ──

async function handleStatus(): Promise<SlackCommandResult> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [totalUsers, todayPosts, todayComments, totalPosts, monthJobs] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
    prisma.comment.count({ where: { createdAt: { gte: todayStart }, status: 'ACTIVE' } }),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({
      where: { boardType: 'JOB', createdAt: { gte: monthStart }, source: 'BOT' },
    }),
  ])

  return {
    response_type: 'in_channel',
    text: `📊 우나어 현황`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 우나어 현황', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*👥 총 유저*\n${totalUsers}명` },
          { type: 'mrkdwn', text: `*📝 오늘 게시글*\n${todayPosts}개` },
          { type: 'mrkdwn', text: `*💬 오늘 댓글*\n${todayComments}개` },
          { type: 'mrkdwn', text: `*📄 전체 게시글*\n${totalPosts}개` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*💼 이번 달 일자리:* ${monthJobs}건 (봇 수집)` },
      },
    ],
  }
}

async function handleAgents(): Promise<SlackCommandResult> {
  const agentTypes = ['CEO', 'CTO', 'CMO', 'CPO', 'COO', 'CDO', 'CFO', 'SEED', 'JOB'] as const

  const results = await Promise.all(
    agentTypes.map(async (type) => {
      const lastLog = await prisma.botLog.findFirst({
        where: { botType: type },
        orderBy: { executedAt: 'desc' },
        select: { status: true, executedAt: true, action: true },
      })

      if (!lastLog) return `${type}: 기록 없음`

      const status = lastLog.status === 'SUCCESS' ? '✅' : '❌'
      const time = lastLog.executedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      return `${status} *${type}*: ${lastLog.action ?? '-'} (${time})`
    }),
  )

  return {
    response_type: 'in_channel',
    text: '🤖 에이전트 상태',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🤖 에이전트 상태', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: results.join('\n') },
      },
    ],
  }
}

async function handleCost(): Promise<SlackCommandResult> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const logs = await prisma.botLog.findMany({
    where: { executedAt: { gte: monthStart } },
    select: { botType: true },
  })

  const heavyAgents = new Set(['CEO', 'CMO', 'CPO', 'COO'])
  let totalCost = 0
  const costByType: Record<string, number> = {}

  for (const log of logs) {
    const cost = heavyAgents.has(log.botType) ? 0.01 : 0.001
    totalCost += cost
    costByType[log.botType] = (costByType[log.botType] ?? 0) + cost
  }

  const breakdown = Object.entries(costByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, cost]) => `  ${type}: $${cost.toFixed(3)}`)
    .join('\n')

  const emoji = totalCost > 40 ? '⚠️' : totalCost > 30 ? '🟡' : '🟢'

  return {
    response_type: 'in_channel',
    text: `💰 이번 달 비용: $${totalCost.toFixed(2)}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💰 이번 달 비용 현황', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*예상 비용*\n${emoji} $${totalCost.toFixed(2)} / $50` },
          { type: 'mrkdwn', text: `*실행 횟수*\n${logs.length}회` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `\`\`\`\n${breakdown}\n\`\`\`` },
      },
    ],
  }
}

async function handleJobs(): Promise<SlackCommandResult> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const logs = await prisma.botLog.findMany({
    where: { botType: 'JOB', executedAt: { gte: todayStart } },
    orderBy: { executedAt: 'desc' },
    select: { status: true, collectedCount: true, publishedCount: true, executedAt: true },
  })

  if (logs.length === 0) {
    return {
      response_type: 'ephemeral',
      text: '💼 오늘 일자리 수집 기록이 없습니다.',
    }
  }

  const total = logs.reduce((s, l) => s + l.publishedCount, 0)
  const runs = logs.map((l) => {
    const t = l.executedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
    return `${l.status === 'SUCCESS' ? '✅' : '❌'} ${t} — 수집 ${l.collectedCount} → 게시 ${l.publishedCount}`
  }).join('\n')

  return {
    response_type: 'in_channel',
    text: `💼 오늘 일자리: ${total}건 게시`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💼 오늘 일자리 현황', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*총 게시:* ${total}건\n\n${runs}` },
      },
    ],
  }
}

async function handleTrend(): Promise<SlackCommandResult> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  if (!trend) {
    return {
      response_type: 'ephemeral',
      text: '📊 아직 오늘의 트렌드 분석 결과가 없어요.',
    }
  }

  const hotTopics = trend.hotTopics as { topic: string; count: number; sentiment: string }[]
  const magazineTopics = trend.magazineTopics as { title: string; reason: string; score: number }[]

  const hotList = hotTopics.slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.topic} (${t.count}건, ${t.sentiment})`)
    .join('\n')

  const magazineList = magazineTopics.slice(0, 3)
    .map((t, i) => `${i + 1}. *${t.title}* (${t.score}/10)\n   └ ${t.reason}`)
    .join('\n')

  return {
    response_type: 'in_channel',
    text: '📊 오늘의 5060 트렌드',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 오늘의 5060 트렌드', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*🔥 핫토픽*\n${hotList}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📰 매거진 주제 추천*\n${magazineList}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `수집: ${trend.totalPosts}개 글 분석` },
        ],
      },
    ],
  }
}

async function handleCafe(): Promise<SlackCommandResult> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [totalToday, byCafe] = await Promise.all([
    prisma.cafePost.count({ where: { crawledAt: { gte: todayStart } } }),
    prisma.cafePost.groupBy({
      by: ['cafeId'],
      where: { crawledAt: { gte: todayStart } },
      _count: { id: true },
    }),
  ])

  const cafeList = byCafe.map(c => `  ${c.cafeId}: ${c._count.id}개`).join('\n')

  const latestCrawl = await prisma.botLog.findFirst({
    where: { botType: 'CAFE_CRAWLER' },
    orderBy: { executedAt: 'desc' },
    select: { executedAt: true, status: true },
  })
  const lastTime = latestCrawl
    ? latestCrawl.executedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '없음'

  return {
    response_type: 'in_channel',
    text: `☕ 카페 크롤링: 오늘 ${totalToday}개 수집`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '☕ 카페 크롤링 현황', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*오늘 수집:* ${totalToday}개\n${cafeList}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `마지막 실행: ${lastTime} (${latestCrawl?.status ?? '-'})` },
        ],
      },
    ],
  }
}

async function handleStop(): Promise<SlackCommandResult> {
  // 알림-긴급 채널에도 전파
  await sendSlackMessage('ALERT_URGENT', '🛑 *자동화 긴급 중지 요청* — 창업자가 /stop 실행')

  return {
    response_type: 'in_channel',
    text: '🛑 자동화 중지 요청',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🛑 자동화 긴급 중지', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'constitution.yaml의 `automation_status`를 `LOCKED`로 변경해야 합니다.\nGitHub에서 직접 수정하거나 Claude Code에게 요청하세요.',
        },
      },
    ],
  }
}

async function handleApprove(text: string): Promise<SlackCommandResult> {
  const id = text.trim()
  if (!id) {
    return { response_type: 'ephemeral', text: '사용법: /approve [ID]' }
  }

  // TODO: AdminQueue 모델 추가 후 활성화
  return {
    response_type: 'ephemeral',
    text: `📋 승인 기능은 AdminQueue DB 모델 추가 후 활성화됩니다. (ID: ${id})`,
  }
}

async function handleReject(text: string): Promise<SlackCommandResult> {
  const id = text.trim()
  if (!id) {
    return { response_type: 'ephemeral', text: '사용법: /reject [ID]' }
  }

  // TODO: AdminQueue 모델 추가 후 활성화
  return {
    response_type: 'ephemeral',
    text: `📋 거절 기능은 AdminQueue DB 모델 추가 후 활성화됩니다. (ID: ${id})`,
  }
}

async function handleKpi(): Promise<SlackCommandResult> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  const [todayUsers, yesterdayUsers, totalPosts, todayPosts] = await Promise.all([
    prisma.eventLog.count({
      where: { createdAt: { gte: todayStart }, eventName: 'PAGE_VIEW' },
    }),
    prisma.eventLog.count({
      where: {
        createdAt: { gte: yesterdayStart, lt: todayStart },
        eventName: 'PAGE_VIEW',
      },
    }),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
  ])

  const change = yesterdayUsers > 0
    ? ((todayUsers - yesterdayUsers) / yesterdayUsers * 100).toFixed(1)
    : 'N/A'
  const changeEmoji = Number(change) > 0 ? '📈' : Number(change) < 0 ? '📉' : '➡️'

  return {
    response_type: 'in_channel',
    text: '📊 KPI 대시보드',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 KPI 대시보드', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*오늘 PV*\n${todayUsers}` },
          { type: 'mrkdwn', text: `*전일 대비*\n${changeEmoji} ${change}%` },
          { type: 'mrkdwn', text: `*전체 게시글*\n${totalPosts}` },
          { type: 'mrkdwn', text: `*오늘 게시글*\n${todayPosts}` },
        ],
      },
    ],
  }
}

async function handleMeeting(text: string): Promise<SlackCommandResult> {
  const topic = text.trim() || '긴급 안건'

  // 에이전트 회의실에 회의 소집 알림
  await sendSlackMessage('AGENT_MEETING', `🔔 *긴급 회의 소집*\n\n안건: ${topic}\n소집자: 창업자\n시간: 즉시`)

  return {
    response_type: 'in_channel',
    text: `🔔 에이전트 긴급 회의 소집: ${topic}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔔 *에이전트 긴급 회의 소집*\n*안건:* ${topic}\n*채널:* #에이전트-회의실`,
        },
      },
    ],
  }
}

function handleHelp(): SlackCommandResult {
  return {
    response_type: 'ephemeral',
    text: '🔧 우나어 슬래시 커맨드',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔧 우나어 슬래시 커맨드', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '`/una-status` — 현재 KPI 요약',
            '`/una-agents` — 에이전트 상태',
            '`/una-cost` — 이번 달 비용',
            '`/una-jobs` — 오늘 일자리 현황',
            '`/una-trend` — 오늘의 5060 트렌드',
            '`/una-cafe` — 카페 크롤링 현황',
            '`/una-kpi` — KPI 대시보드',
            '`/una-approve [ID]` — 어드민 큐 승인',
            '`/una-reject [ID]` — 어드민 큐 거절',
            '`/una-stop` — 자동화 긴급 중지',
            '`/una-meeting [안건]` — 에이전트 긴급 회의',
            '`/help` — 이 목록',
          ].join('\n'),
        },
      },
    ],
  }
}

/**
 * 슬래시 커맨드 라우터
 */
export async function handleSlashCommand(payload: SlackSlashCommand): Promise<SlackCommandResult> {
  // '/una-status' → 'status', '/help' → 'help'
  const command = payload.command.replace('/', '').replace('una-', '')
  const text = payload.text

  switch (command) {
    case 'status':   return handleStatus()
    case 'agents':   return handleAgents()
    case 'cost':     return handleCost()
    case 'jobs':     return handleJobs()
    case 'trend':    return handleTrend()
    case 'cafe':     return handleCafe()
    case 'kpi':      return handleKpi()
    case 'approve':  return handleApprove(text)
    case 'reject':   return handleReject(text)
    case 'stop':     return handleStop()
    case 'meeting':  return handleMeeting(text)
    case 'help':     return handleHelp()
    default:
      return {
        response_type: 'ephemeral',
        text: `알 수 없는 명령어: ${payload.command}\n/help 를 입력하세요.`,
      }
  }
}
