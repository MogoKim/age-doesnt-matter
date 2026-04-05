import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import { fetchGA4Report, fetchSearchConsoleReport } from '../core/google-api.js'
import type { AgentResult } from '../core/types.js'
import type { GA4Report, SearchConsoleReport } from '../core/google-api.js'

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

    // OKR 연계 지표
    // KR2: NSM — 주간 댓글 참여 유저
    const nsmResult = await prisma.comment.groupBy({
      by: ['authorId'],
      where: { createdAt: { gte: sevenDaysAgo }, status: 'ACTIVE' },
    })
    const weeklyNSM = nsmResult.length

    // 온보딩 완료율 (KR3 전제)
    const [onboardedCount, totalActiveUsers] = await Promise.all([
      prisma.user.count({ where: { isOnboarded: true, status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
    ])
    const onboardingRate = totalActiveUsers > 0 ? Math.round((onboardedCount / totalActiveUsers) * 100) : 0

    // LIFE2 게시판 활성도
    const life2WeeklyPosts = await prisma.post.count({
      where: { boardType: 'LIFE2', status: 'PUBLISHED', createdAt: { gte: sevenDaysAgo } },
    })

    const dauMauRatio = mau > 0 ? (dau / mau).toFixed(3) : 'N/A'
    const ugcRatio = totalPosts > 0 ? ((userPosts / totalPosts) * 100).toFixed(1) : '0'

    // GA4 + Search Console 외부 데이터 (환경변수 설정 시에만)
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const ga4Data: GA4Report | null = await fetchGA4Report(yesterdayStr, todayStr)
    const scData: SearchConsoleReport | null = await fetchSearchConsoleReport(yesterdayStr, todayStr)

    const kpi: Record<string, unknown> = {
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
      weeklyNSM,
      onboardingRate: `${onboardingRate}%`,
      life2WeeklyPosts,
      ...(ga4Data ? { ga4: ga4Data } : {}),
      ...(scData ? { searchConsole: scData } : {}),
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

    // 내부 DB KPI 요약
    const summaryParts: string[] = [
      `DAU ${dau} | MAU ${mau} | DAU/MAU ${dauMauRatio} | UGC ${ugcRatio}% | 글 ${todayPosts} | 댓글 ${todayComments} | 공감 ${todayLikes}`,
      `\n📊 OKR 연계 지표\n  KR2 NSM: ${weeklyNSM}명/주 (목표 50명)\n  온보딩 완료율: ${onboardingRate}% (목표 70%)\n  LIFE2 주간 게시글: ${life2WeeklyPosts}건`,
    ]

    // GA4 요약 (데이터 있을 때만)
    if (ga4Data) {
      summaryParts.push(
        `\n📊 GA4: 활성 ${ga4Data.activeUsers}명 | 세션 ${ga4Data.sessions} | PV ${ga4Data.pageViews} | 이탈률 ${(ga4Data.bounceRate * 100).toFixed(1)}%`,
      )
    }

    // Search Console 요약 (데이터 있을 때만)
    if (scData) {
      summaryParts.push(
        `\n🔍 SC: 클릭 ${scData.totalClicks} | 노출 ${scData.totalImpressions} | CTR ${(scData.avgCtr * 100).toFixed(1)}% | 순위 ${scData.avgPosition.toFixed(1)}`,
      )
    }

    const summary = summaryParts.join('')

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
