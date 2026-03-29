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

    // 4. 기능 사용 이벤트 (FAB, 스크랩, 좋아요 등)
    const featureEvents = await prisma.eventLog.findMany({
      where: {
        createdAt: { gte: yesterday },
        eventName: { in: ['fab_click', 'scrap_toggle', 'like_toggle', 'share_click', 'search_submit', 'job_apply_click'] },
      },
      select: { eventName: true },
      take: 2000,
    })

    const featureCounts = new Map<string, number>()
    for (const e of featureEvents) {
      featureCounts.set(e.eventName, (featureCounts.get(e.eventName) ?? 0) + 1)
    }

    // 5. 등급 전환 데이터 (최근 7일 신규 가입 → 등급 분포)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentUserGrades = await prisma.user.groupBy({
      by: ['grade'],
      where: { createdAt: { gte: weekAgo } },
      _count: { id: true },
    })

    // 6. AI 분석
    const analysis = await this.chat(`
아래 UX 데이터를 분석하고 구체적이고 실행 가능한 개선 제안을 해주세요.
50대 60대 사용자 대상 커뮤니티입니다. 직관적이고 쉬운 UX가 핵심입니다.

[페이지별 방문 수 (어제)]
${topPages.map(([path, count]) => `- ${path}: ${count}회`).join('\n') || '(데이터 없음)'}

[등급별 전체 분포]
${gradeDistribution.map((g) => `- ${g.grade}: ${g._count}명`).join('\n')}

[최근 7일 가입자 등급 분포]
${recentUserGrades.map((g) => `- ${g.grade}: ${g._count.id}명`).join('\n')}

[활동 지표 (어제)]
- 신규 가입: ${newUsers}명
- 글 작성 유저: ${activePosters}명
- 댓글 작성 유저: ${activeCommenters}명

[기능 사용률 (어제)]
${[...featureCounts.entries()].map(([name, count]) => `- ${name}: ${count}회`).join('\n') || '(데이터 없음)'}

응답 형식 (JSON):
{
  "ux_summary": "UX 현황 요약 (2-3문장, 핵심 수치 포함)",
  "issues": ["발견된 UX 이슈 (구체적으로: 어떤 페이지/기능에서 어떤 문제가 있는지)"],
  "feature_adoption": "기능 채택률 요약 (어떤 기능이 잘 쓰이고 어떤 기능이 안 쓰이는지)",
  "grade_insights": "등급 전환 인사이트 (새싹 → 단골 전환이 잘 되는지, 병목이 어디인지)",
  "suggestions": ["구체적 개선 제안 (예: '글쓰기 FAB 크기를 72px로 확대하고 흔들림 애니메이션 추가')"]
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
