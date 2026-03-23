import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CDO 에이전트 — KPI 집계
 * 매일 22:00: DAU/MAU, UGC 비율, 리텐션 등 핵심 지표 수집
 */
class CDOKpiCollector extends BaseAgent {
  constructor() {
    super({
      name: 'CDO',
      botType: 'CDO',
      role: 'CDO (데이터총괄)',
      model: 'light',
      tasks: '데일리 KPI 집계, 위클리 딥다이브, 이상 감지',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      dau,
      mau,
      totalUsers,
      todayPosts,
      todayComments,
      todayLikes,
      todayScraps,
      totalPosts,
      userPosts,
      botPosts,
      newUsers7d,
      reports,
    ] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gte: yesterday } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count(),
      prisma.post.count({ where: { createdAt: { gte: yesterday }, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.like.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.scrap.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.post.count({ where: { source: 'USER', status: 'PUBLISHED' } }),
      prisma.post.count({ where: { source: 'BOT', status: 'PUBLISHED' } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.report.count({ where: { createdAt: { gte: yesterday } } }),
    ])

    const dauMauRatio = mau > 0 ? (dau / mau).toFixed(3) : 'N/A'
    const ugcRatio = totalPosts > 0 ? ((userPosts / totalPosts) * 100).toFixed(1) : '0'

    const kpi = {
      dau,
      mau,
      dauMauRatio,
      totalUsers,
      todayPosts,
      todayComments,
      todayLikes,
      todayScraps,
      totalPosts,
      ugcRatio: `${ugcRatio}%`,
      userPosts,
      botPosts,
      newUsers7d,
      reports,
    }

    // KPI를 BotLog에 기록 (히스토리 추적용)
    await prisma.botLog.create({
      data: {
        botType: 'CDO' as const,
        action: 'KPI_DAILY',
        status: 'SUCCESS' as const,
        details: JSON.stringify(kpi),
        itemCount: 0,
        executionTimeMs: 0,
      },
    })

    const summary = `DAU ${dau} | MAU ${mau} | DAU/MAU ${dauMauRatio} | UGC ${ugcRatio}% | 글 ${todayPosts} | 댓글 ${todayComments} | 공감 ${todayLikes}`

    await notifyAdmin({
      level: 'info',
      agent: 'CDO',
      title: '데일리 KPI 리포트',
      body: summary,
    })

    return {
      agent: 'CDO',
      success: true,
      summary,
      data: kpi,
    }
  }
}

const agent = new CDOKpiCollector()
agent.execute().then((result) => {
  console.log('[CDO] KPI:', result.summary)
  process.exit(0)
})
