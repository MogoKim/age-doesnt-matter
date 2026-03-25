import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const AUTHORIZED_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

async function sendMessage(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

async function handleStatus(): Promise<string> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [totalUsers, todayPosts, todayComments, totalPosts, monthJobs] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.post.count({ where: { createdAt: { gte: todayStart }, status: 'PUBLISHED' } }),
    prisma.comment.count({ where: { createdAt: { gte: todayStart }, status: 'ACTIVE' } }),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({ where: { boardType: 'JOB', createdAt: { gte: monthStart }, source: 'BOT' } }),
  ])

  return `📊 *우나어 현황*\n\n👥 총 유저: ${totalUsers}명\n📝 오늘 게시글: ${todayPosts}개\n💬 오늘 댓글: ${todayComments}개\n📄 전체 게시글: ${totalPosts}개\n💼 이번 달 일자리: ${monthJobs}건`
}

async function handleAgents(): Promise<string> {
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
      return `${status} ${type}: ${lastLog.action ?? '-'} (${time})`
    }),
  )
  return `🤖 *에이전트 상태*\n\n${results.join('\n')}`
}

async function handleCost(): Promise<string> {
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
  return `💰 *이번 달 비용*\n\n${emoji} 예상: *$${totalCost.toFixed(2)}* / $50\n실행: ${logs.length}회\n\n${breakdown}`
}

async function handleTrend(): Promise<string> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  if (!trend) return '📊 *오늘의 트렌드*\n\n아직 분석 결과가 없어요. 카페 크롤링 먼저 실행해주세요.'

  const hotTopics = trend.hotTopics as { topic: string; count: number; sentiment: string }[]
  const magazineTopics = trend.magazineTopics as { title: string; reason: string; score: number }[]

  const hotList = hotTopics.slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.topic} (${t.count}건, ${t.sentiment})`)
    .join('\n')

  const magazineList = magazineTopics.slice(0, 3)
    .map((t, i) => `${i + 1}. *${t.title}* (${t.score}/10)\n   └ ${t.reason}`)
    .join('\n')

  return `📊 *오늘의 5060 트렌드*\n\n🔥 *핫토픽*\n${hotList}\n\n📰 *매거진 주제 추천*\n${magazineList}\n\n수집: ${trend.totalPosts}개 글 분석`
}

async function handleCafe(): Promise<string> {
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

  return `☕ *카페 크롤링 현황*\n\n오늘 수집: ${totalToday}개\n${cafeList}\n\n마지막 실행: ${lastTime} (${latestCrawl?.status ?? '-'})`
}

async function handleJobs(): Promise<string> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const logs = await prisma.botLog.findMany({
    where: { botType: 'JOB', executedAt: { gte: todayStart } },
    orderBy: { executedAt: 'desc' },
    select: { status: true, collectedCount: true, publishedCount: true, executedAt: true },
  })

  if (logs.length === 0) return '💼 *오늘 일자리*\n\n수집 기록 없음'

  const total = logs.reduce((s, l) => s + l.publishedCount, 0)
  const runs = logs.map((l) => {
    const t = l.executedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
    return `${l.status === 'SUCCESS' ? '✅' : '❌'} ${t} — 수집 ${l.collectedCount} → 게시 ${l.publishedCount}`
  }).join('\n')

  return `💼 *오늘 일자리*\n\n총 게시: ${total}건\n\n${runs}`
}

export async function POST(request: Request) {
  try {
    const update = (await request.json()) as TelegramUpdate
    const message = update.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = String(message.chat.id)
    if (chatId !== AUTHORIZED_CHAT_ID) {
      await sendMessage(chatId, '⛔ 인증되지 않은 사용자입니다.')
      return NextResponse.json({ ok: true })
    }

    const [command] = message.text.trim().split(' ')
    let response: string

    switch (command) {
      case '/status': response = await handleStatus(); break
      case '/agents': response = await handleAgents(); break
      case '/cost': response = await handleCost(); break
      case '/jobs': response = await handleJobs(); break
      case '/trend': response = await handleTrend(); break
      case '/cafe': response = await handleCafe(); break
      case '/stop':
        response = '🛑 *자동화 중지*\n\nconstitution.yaml → automation\\_status: LOCKED 로 변경 필요'
        break
      case '/help':
      default:
        response = '🔧 *명령어*\n\n/status — KPI 요약\n/agents — 에이전트 상태\n/cost — 비용 현황\n/jobs — 일자리 현황\n/trend — 오늘의 5060 트렌드\n/cafe — 카페 크롤링 현황\n/stop — 자동화 중지\n/help — 도움말'
    }

    await sendMessage(chatId, response)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Telegram Webhook] Error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
