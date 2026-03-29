import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CPO 에이전트 — 기능 사용률 트래커
 * 매주 월요일 11:30 KST 실행
 * 주요 기능별 사용률 집계 + 추세 분석
 */
class CPOFeatureTracker extends BaseAgent {
  constructor() {
    super({
      name: 'CPO',
      botType: 'CPO',
      role: 'CPO (프로덕트총괄)',
      model: 'heavy',
      tasks: '기능 사용률 추적: FAB, 스크랩, 일자리 지원, 매거진, 댓글 등 핵심 기능 채택률 분석',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    // 이번 주 기능별 이벤트 수집
    const thisWeekEvents = await prisma.eventLog.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { eventName: true, path: true },
      take: 5000,
    })

    // 지난 주 기능별 이벤트 수집 (추세 비교)
    const lastWeekEvents = await prisma.eventLog.findMany({
      where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      select: { eventName: true },
      take: 5000,
    })

    // 기능별 카운트
    const featureNames = [
      'fab_click', 'scrap_toggle', 'job_apply_click', 'magazine_read',
      'comment_submit', 'like_toggle', 'share_click', 'search_submit',
      'profile_view', 'notification_click', 'page_view',
    ]

    function countByFeature(events: Array<{ eventName: string }>) {
      const counts = new Map<string, number>()
      for (const e of events) {
        counts.set(e.eventName, (counts.get(e.eventName) ?? 0) + 1)
      }
      return counts
    }

    const thisWeekCounts = countByFeature(thisWeekEvents)
    const lastWeekCounts = countByFeature(lastWeekEvents)

    // 추세 분석 데이터 구성
    const featureReport = featureNames.map(name => {
      const thisWeek = thisWeekCounts.get(name) ?? 0
      const lastWeek = lastWeekCounts.get(name) ?? 0
      const change = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek * 100).toFixed(1) : 'N/A'
      return { name, thisWeek, lastWeek, change }
    }).filter(f => f.thisWeek > 0 || f.lastWeek > 0)

    // 페이지별 방문 TOP 10
    const pageCounts = new Map<string, number>()
    for (const e of thisWeekEvents) {
      if (e.eventName === 'page_view' && e.path) {
        pageCounts.set(e.path, (pageCounts.get(e.path) ?? 0) + 1)
      }
    }
    const topPages = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    // AI 분석
    const analysisPrompt = `아래 기능 사용률 데이터를 분석하고 JSON으로 응답하세요.

기능별 사용률 (이번 주 / 지난 주 / 변화율):
${featureReport.map(f => `- ${f.name}: ${f.thisWeek} / ${f.lastWeek} (${f.change}%)`).join('\n')}

페이지 방문 TOP 10:
${topPages.map(([path, count]) => `- ${path}: ${count}`).join('\n')}

JSON 형식:
{
  "summary": "전체 요약 (2-3문장)",
  "topFeatures": ["가장 많이 사용된 기능 3개"],
  "underusedFeatures": ["활성화 필요한 기능 2-3개"],
  "trendInsights": ["주목할 추세 2-3개"],
  "recommendations": ["개선 제안 2-3개"]
}`

    const aiResponse = await this.chat(analysisPrompt, 1024)

    // Slack 리포트
    const slackBody = featureReport.map(f => `• ${f.name}: ${f.thisWeek}회 (${f.change}%)`).join('\n')
      + `\n\nAI 분석:\n${aiResponse.slice(0, 500)}`

    await notifySlack({
      level: 'info',
      agent: 'CPO',
      title: 'CPO 주간 기능 사용률 리포트',
      body: slackBody,
    })

    return {
      agent: 'CPO',
      success: true,
      summary: `기능 ${featureReport.length}개 분석 완료`,
      data: { featureReport, topPages: Object.fromEntries(topPages) },
    }
  }
}

// 실행
const agent = new CPOFeatureTracker()
agent.execute()
  .then(r => { console.log(r.summary); process.exit(0) })
  .catch(e => { console.error(e); process.exit(1) })
