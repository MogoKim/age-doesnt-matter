import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CPO 에이전트 — 사용자 여정 분석
 * 매주 월요일 12:00 KST 실행
 * 전환 퍼널, 등급 전환, 이탈 지점 분석
 */
class CPOJourneyAnalyzer extends BaseAgent {
  constructor() {
    super({
      name: 'CPO',
      botType: 'CPO',
      role: 'CPO (프로덕트총괄)',
      model: 'heavy',
      tasks: '사용자 여정 분석: 전환 퍼널, 등급 전환 병목, 이탈 지점 감지',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // 1. 전환 퍼널 데이터
    const totalVisitors = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', createdAt: { gte: weekAgo } },
      select: { userId: true },
      distinct: ['userId'],
    })

    const totalMembers = await prisma.user.count({
      where: { createdAt: { gte: weekAgo } },
    })

    const membersWithPosts = await prisma.post.findMany({
      where: { createdAt: { gte: monthAgo } },
      select: { authorId: true },
      distinct: ['authorId'],
    })

    const repeatPosters = await prisma.post.groupBy({
      by: ['authorId'],
      where: { createdAt: { gte: monthAgo } },
      _count: { id: true },
      having: { id: { _count: { gte: 3 } } },
    })

    // 2. 등급 분포
    const gradeDistribution = await prisma.user.groupBy({
      by: ['grade'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    // 3. 이탈 페이지 분석 (bounced sessions)
    const pageViews = await prisma.eventLog.findMany({
      where: { eventName: 'page_view', createdAt: { gte: weekAgo } },
      select: { path: true, userId: true, sessionId: true },
      take: 3000,
    })

    // Group by session → single-page sessions = bounce
    const sessionPages = new Map<string, Set<string>>()
    for (const pv of pageViews) {
      const sid = pv.sessionId ?? pv.userId ?? 'anon'
      if (!sessionPages.has(sid)) sessionPages.set(sid, new Set())
      if (pv.path) sessionPages.get(sid)!.add(pv.path)
    }

    const bouncedPages = new Map<string, number>()
    for (const [, pages] of sessionPages) {
      if (pages.size === 1) {
        const page = [...pages][0]
        bouncedPages.set(page, (bouncedPages.get(page) ?? 0) + 1)
      }
    }
    const topBouncedPages = [...bouncedPages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // AI 분석
    const funnelData = {
      visitors: totalVisitors.length,
      newMembers: totalMembers,
      activePosterCount: membersWithPosts.length,
      repeatPosterCount: repeatPosters.length,
      gradeDistribution: gradeDistribution.map(g => ({ grade: g.grade, count: g._count.id })),
      topBouncedPages: topBouncedPages.map(([page, count]) => ({ page, bounces: count })),
    }

    const analysisPrompt = `사용자 여정 데이터를 분석하세요. JSON으로 응답.

전환 퍼널 (최근 7일):
- 방문자(unique): ${funnelData.visitors}
- 신규 가입: ${funnelData.newMembers}
- 글 작성 회원 (30일): ${funnelData.activePosterCount}
- 3회 이상 글 작성 (30일): ${funnelData.repeatPosterCount}

등급 분포:
${funnelData.gradeDistribution.map(g => `- ${g.grade}: ${g.count}명`).join('\n')}

이탈 TOP 5 페이지 (단일 페이지 세션):
${funnelData.topBouncedPages.map(p => `- ${p.page}: ${p.bounces}회`).join('\n')}

JSON:
{
  "funnelAnalysis": "퍼널 분석 (2-3문장)",
  "bottlenecks": ["병목 지점 2-3개"],
  "gradeInsights": "등급 전환 인사이트",
  "bounceInsights": ["이탈 개선 제안 2-3개"],
  "productSuggestions": ["제품 개선 제안 2-3개"]
}`

    const aiResponse = await this.chat(analysisPrompt, 1024)

    const slackBody = `퍼널: 방문 ${funnelData.visitors} → 가입 ${funnelData.newMembers} → 글작성 ${funnelData.activePosterCount} → 반복 ${funnelData.repeatPosterCount}\n\nAI 분석:\n${aiResponse.slice(0, 500)}`

    await notifySlack({
      level: 'info',
      agent: 'CPO',
      title: 'CPO 주간 사용자 여정 분석',
      body: slackBody,
    })

    return {
      agent: 'CPO',
      success: true,
      summary: `퍼널 분석 완료: 방문 ${funnelData.visitors} → 가입 ${funnelData.newMembers}`,
      data: funnelData,
    }
  }
}

const agent = new CPOJourneyAnalyzer()
agent.execute()
  .then(r => { console.log(r.summary); process.exit(0) })
  .catch(e => { console.error(e); process.exit(1) })
