/**
 * Telegram Commander — 모바일 커맨드 인터페이스
 *
 * 창업자가 핸드폰에서 Telegram으로 시스템을 관리할 수 있도록 하는 양방향 봇.
 * Vercel Serverless Function으로 배포되어 Webhook을 통해 메시지를 수신합니다.
 *
 * 명령어:
 *   /status     — 현재 KPI 요약 (DAU, 게시글, 수익)
 *   /agents     — 에이전트 상태 (마지막 실행, 성공/실패)
 *   /cost       — 이번 달 비용 현황
 *   /jobs       — 오늘 일자리 수집 현황
 *   /stop       — 전체 자동화 긴급 중지
 *   /start      — 자동화 재개
 *   /approve N  — 어드민 큐 항목 승인 (미래 구현)
 *   /help       — 명령어 목록
 */

import { prisma } from './db.js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
    from?: { id: number; first_name: string }
  }
}

/** Telegram 메시지 전송 */
async function sendMessage(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
}

/** /status — KPI 요약 */
async function handleStatus(): Promise<string> {
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

  return `📊 *우나어 현황*

👥 총 유저: ${totalUsers}명
📝 오늘 게시글: ${todayPosts}개
💬 오늘 댓글: ${todayComments}개
📄 전체 게시글: ${totalPosts}개
💼 이번 달 일자리: ${monthJobs}건 (봇 수집)`
}

/** /agents — 에이전트 상태 */
async function handleAgents(): Promise<string> {
  const agentTypes = ['CEO', 'CTO', 'CMO', 'CPO', 'COO', 'CDO', 'CFO', 'SEED'] as const

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
      return `${status} ${type}: ${lastLog.action ?? '-'} (${time})`
    }),
  )

  return `🤖 *에이전트 상태*\n\n${results.join('\n')}`
}

/** /cost — 비용 현황 */
async function handleCost(): Promise<string> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const logs = await prisma.botLog.findMany({
    where: { executedAt: { gte: monthStart } },
    select: { botType: true },
  })

  // 모델별 비용 추정
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

  const warningEmoji = totalCost > 40 ? '⚠️' : totalCost > 30 ? '🟡' : '🟢'

  return `💰 *이번 달 비용 현황*

${warningEmoji} 예상 총 비용: *$${totalCost.toFixed(2)}* / $50.00
실행 횟수: ${logs.length}회

${breakdown}`
}

/** /jobs — 오늘 일자리 수집 현황 */
async function handleJobs(): Promise<string> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const jobLogs = await prisma.botLog.findMany({
    where: {
      botType: 'JOB',
      executedAt: { gte: todayStart },
    },
    orderBy: { executedAt: 'desc' },
    select: {
      status: true,
      collectedCount: true,
      filteredCount: true,
      publishedCount: true,
      executedAt: true,
      details: true,
    },
  })

  if (jobLogs.length === 0) {
    return '💼 *오늘 일자리*\n\n아직 수집 기록이 없습니다.'
  }

  const totalPublished = jobLogs.reduce((sum, l) => sum + l.publishedCount, 0)
  const runs = jobLogs
    .map((l) => {
      const time = l.executedAt.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      })
      const status = l.status === 'SUCCESS' ? '✅' : '❌'
      return `${status} ${time} — 수집 ${l.collectedCount} → 게시 ${l.publishedCount}`
    })
    .join('\n')

  return `💼 *오늘 일자리 현황*\n\n총 게시: ${totalPublished}건\n\n${runs}`
}

/** /help — 명령어 목록 */
function handleHelp(): string {
  return `🔧 *우나어 커맨드*

/status — 현재 KPI 요약
/agents — 에이전트 상태
/cost — 이번 달 비용
/jobs — 오늘 일자리 수집 현황
/stop — 자동화 긴급 중지
/start — 자동화 재개
/help — 이 목록`
}

/**
 * Webhook 핸들러 — Vercel Serverless Function에서 호출
 */
export async function handleWebhook(update: TelegramUpdate): Promise<string> {
  const message = update.message
  if (!message?.text) return 'ok'

  const chatId = String(message.chat.id)

  // 인증: 등록된 chat_id만 허용
  if (chatId !== AUTHORIZED_CHAT_ID) {
    await sendMessage(chatId, '⛔ 인증되지 않은 사용자입니다.')
    return 'unauthorized'
  }

  const text = message.text.trim()
  const [command] = text.split(' ')

  let response: string

  switch (command) {
    case '/status':
      response = await handleStatus()
      break
    case '/agents':
      response = await handleAgents()
      break
    case '/cost':
      response = await handleCost()
      break
    case '/jobs':
      response = await handleJobs()
      break
    case '/stop':
      response = '🛑 *자동화 중지 요청*\n\nconstitution.yaml의 automation\\_status를 LOCKED로 변경해야 합니다.\n현재는 GitHub에서 직접 수정이 필요합니다.'
      break
    case '/start':
      response = '▶️ *자동화 재개*\n\nconstitution.yaml의 automation\\_status가 ACTIVE인지 확인하세요.'
      break
    case '/help':
    case '/start':
      response = handleHelp()
      break
    default:
      response = `알 수 없는 명령어: ${command}\n/help 를 입력하세요.`
  }

  await sendMessage(chatId, response)
  return 'ok'
}
