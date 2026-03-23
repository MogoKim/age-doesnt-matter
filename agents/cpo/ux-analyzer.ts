import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CPO 에이전트 — UX 분석
 * 매일 11:00: 이탈률 높은 페이지, 등급 전환 분석
 */
class CPOUXAnalyzer extends BaseAgent {
  constructor() {
    super({
      name: 'CPO',
      botType: 'CPO',
      role: 'CPO (프로덕트총괄)',
      model: 'heavy',
      tasks: 'UX 이슈 발견, 기능 사용률 분석, 등급 전환 분석, 기능 제안',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // 1. 페이지별 방문 수 (page_view 이벤트)
    const pageViews = await prisma.eventLog.findMany({
      where: {
        eventName: 'page_view',
        createdAt: { gte: yesterday },
      },
      select: { path: true },
      take: 2000,
    })

    const pathCounts = new Map<string, number>()
    for (const pv of pageViews) {
      if (pv.path) {
        pathCounts.set(pv.path, (pathCounts.get(pv.path) ?? 0) + 1)
      }
    }

    const topPages = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)

    // 2. 등급별 사용자 분포
    const gradeDistribution = await prisma.user.groupBy({
      by: ['grade'],
      _count: true,
    })

    // 3. 활동 지표
    const [newUsers, activePosters, activeCommenters] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.user.count({ where: { posts: { some: { createdAt: { gte: yesterday } } } } }),
      prisma.user.count({ where: { comments: { some: { createdAt: { gte: yesterday } } } } }),
    ])

    // 4. AI 분석
    const analysis = await this.chat(`
아래 UX 데이터를 분석하고 개선 제안을 해주세요.

[페이지별 방문 수 (어제)]
${topPages.map(([path, count]) => `- ${path}: ${count}회`).join('\n') || '(데이터 없음)'}

[등급별 분포]
${gradeDistribution.map((g) => `- ${g.grade}: ${g._count}명`).join('\n')}

[활동 지표]
- 신규 가입: ${newUsers}명
- 글 작성 유저: ${activePosters}명
- 댓글 작성 유저: ${activeCommenters}명

응답 형식 (JSON):
{
  "ux_summary": "UX 현황 요약 (2-3문장)",
  "issues": ["발견된 UX 이슈 (이탈, 미사용 기능 등)"],
  "suggestions": ["개선 제안 (창업자 승인 필요)"]
}
`)

    let parsed: { ux_summary: string; issues: string[]; suggestions: string[] }
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { ux_summary: analysis.slice(0, 200), issues: [], suggestions: [] }
    } catch {
      parsed = { ux_summary: analysis.slice(0, 200), issues: [], suggestions: [] }
    }

    await notifyAdmin({
      level: 'info',
      agent: 'CPO',
      title: 'UX 분석 리포트',
      body: parsed.ux_summary,
    })

    return {
      agent: 'CPO',
      success: true,
      summary: parsed.ux_summary,
      data: { topPages, gradeDistribution, suggestions: parsed.suggestions },
    }
  }
}

const agent = new CPOUXAnalyzer()
agent.execute().then((result) => {
  console.log('[CPO] UX 분석:', result.summary)
  process.exit(0)
})
