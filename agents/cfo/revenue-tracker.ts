import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin, sendSlackMessage } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CFO 에이전트 — 수익 추적
 * 매일 23:30 실행: AdSense 노출/클릭 + 쿠팡 CPS 데이터 집계
 */
class CFORevenueTracker extends BaseAgent {
  constructor() {
    super({
      name: 'CFO',
      botType: 'CFO',
      role: 'CFO (재무총괄)',
      model: 'light',
      tasks: '수익 추적: AdSense 광고 성과 + 쿠팡 CPS 실적 집계',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // 1. AdSense 광고 성과 (DB 기반 — AdBanner 테이블)
    const adBanners = await prisma.adBanner.findMany({
      where: { isActive: true },
      select: { id: true, slot: true, adType: true, impressions: true, clicks: true, title: true },
    })

    let totalImpressions = 0
    let totalClicks = 0
    const slotStats: Record<string, { impressions: number; clicks: number; ctr: string }> = {}

    for (const ad of adBanners) {
      totalImpressions += ad.impressions
      totalClicks += ad.clicks
      const slot = ad.slot
      if (!slotStats[slot]) slotStats[slot] = { impressions: 0, clicks: 0, ctr: '0%' }
      slotStats[slot].impressions += ad.impressions
      slotStats[slot].clicks += ad.clicks
    }

    // 슬롯별 CTR 계산
    for (const [slot, stats] of Object.entries(slotStats)) {
      stats.ctr = stats.impressions > 0
        ? `${((stats.clicks / stats.impressions) * 100).toFixed(2)}%`
        : '0%'
    }

    const overallCTR = totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2)
      : '0'

    // 2. 쿠팡 CPS 링크 성과
    const cpsLinks = await prisma.cpsLink.count({
      where: { createdAt: { gte: monthStart } },
    })

    // 3. 이번 달 에이전트 비용 (cost-tracker와 동일 로직)
    const agentBreakdown = await prisma.botLog.groupBy({
      by: ['botType'],
      where: { createdAt: { gte: monthStart } },
      _count: true,
    })

    const heavyAgents = new Set(['CEO', 'CMO', 'CPO', 'COO'])
    let monthCost = 0
    for (const agent of agentBreakdown) {
      monthCost += agent._count * (heavyAgents.has(agent.botType) ? 0.01 : 0.001)
    }

    // 4. 예상 AdSense 수익 (산업 평균 RPM 기준 추정)
    // 한국 커뮤니티 사이트 평균 RPM: $1~3
    const estimatedAdRevenue = (totalImpressions / 1000) * 1.5 // 보수적 $1.5 RPM

    // 5. Slack 리포트 전송
    const slotSummary = Object.entries(slotStats)
      .map(([slot, s]) => `  ${slot}: ${s.impressions.toLocaleString()} 노출 / ${s.clicks} 클릭 (CTR ${s.ctr})`)
      .join('\n')

    await sendSlackMessage('LOG_COST', '', [
      {
        type: 'header',
        text: { type: 'plain_text', text: `CFO 수익 리포트 — ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })}`, emoji: true },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*:chart_with_upwards_trend: 광고 성과 (누적)*' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*총 노출*\n${totalImpressions.toLocaleString()}회` },
          { type: 'mrkdwn', text: `*총 클릭*\n${totalClicks.toLocaleString()}회` },
          { type: 'mrkdwn', text: `*평균 CTR*\n${overallCTR}%` },
          { type: 'mrkdwn', text: `*예상 수익*\n$${estimatedAdRevenue.toFixed(2)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:mag: 슬롯별 성과*\n\`\`\`\n${slotSummary || '  데이터 없음'}\n\`\`\`` },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*:shopping_trolley: 쿠팡 CPS 링크*\n이번 달 ${cpsLinks}개` },
          { type: 'mrkdwn', text: `*:moneybag: 이번 달 비용*\n$${monthCost.toFixed(2)}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:scales: 손익 추정*\n수익: $${estimatedAdRevenue.toFixed(2)} / 비용: $${monthCost.toFixed(2)} → *${estimatedAdRevenue >= monthCost ? ':white_check_mark: 흑자' : ':warning: 적자'}* ($${(estimatedAdRevenue - monthCost).toFixed(2)})`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `자동 생성 by CFO 에이전트 | ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }],
      },
    ])

    // 6. 로그 기록
    await prisma.botLog.create({
      data: {
        botType: 'CFO',
        action: 'REVENUE_TRACK',
        status: 'SUCCESS',
        details: JSON.stringify({
          adImpressions: totalImpressions,
          adClicks: totalClicks,
          ctr: overallCTR,
          estimatedRevenue: estimatedAdRevenue,
          cpsLinks,
          monthCost,
          slotStats,
        }),
        itemCount: adBanners.length,
        executionTimeMs: 0,
      },
    })

    const summary = `수익: $${estimatedAdRevenue.toFixed(2)} / 비용: $${monthCost.toFixed(2)} | 광고 ${totalImpressions.toLocaleString()} 노출, CTR ${overallCTR}%`

    await notifyAdmin({
      level: 'info',
      agent: 'CFO',
      title: '수익 추적 완료',
      body: summary,
    })

    return {
      agent: 'CFO',
      success: true,
      summary,
      data: {
        adImpressions: totalImpressions,
        adClicks: totalClicks,
        ctr: overallCTR,
        estimatedRevenueUsd: estimatedAdRevenue,
        cpsLinks,
        monthCostUsd: monthCost,
      },
    }
  }
}

// 직접 실행
const agent = new CFORevenueTracker()
agent.execute().then((result) => {
  console.log('[CFO] 수익 추적:', result.summary)
  process.exit(result.success ? 0 : 1)
})
