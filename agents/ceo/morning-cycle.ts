import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin, notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CEO 에이전트 — 모닝 사이클
 * 매일 09:00 실행: KPI 수집 → 이상 감지 → 액션 배정
 */
class CEOMorningCycle extends BaseAgent {
  constructor() {
    super({
      name: 'CEO',
      botType: 'CEO',
      role: 'CEO (최고경영자)',
      model: 'light',
      tasks: '모닝 사이클: 전체 KPI 수집, 문제 감지, 에이전트 소집 및 액션 배정',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    // 1. KPI 수집
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    const [todayUsers, yesterdayUsers, totalPosts, todayPosts, todayComments, todayLikes] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gte: yesterday } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: twoDaysAgo, lt: yesterday } } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.post.count({ where: { createdAt: { gte: yesterday }, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.like.count({ where: { createdAt: { gte: yesterday } } }),
    ])

    const dauChange = yesterdayUsers > 0
      ? ((todayUsers - yesterdayUsers) / yesterdayUsers * 100).toFixed(1)
      : 'N/A'

    // 2. AI 분석
    const kpiSummary = `
[일일 KPI 현황]
- DAU(어제 로그인): ${todayUsers}명 (전일 대비 ${dauChange}%)
- 전체 게시글: ${totalPosts}건
- 어제 신규 글: ${todayPosts}건
- 어제 댓글: ${todayComments}건
- 어제 공감: ${todayLikes}건
`

    const analysis = await this.chat(`
아래 KPI를 분석하고, 문제가 있다면 어떤 에이전트에게 어떤 액션을 배정할지 JSON으로 응답하세요.
문제가 없다면 빈 배열로 응답하세요.

${kpiSummary}

응답 형식:
{
  "summary": "전체 요약 (1-2문장)",
  "issues": [{"agent": "CTO|CMO|CPO|COO|CDO|CFO", "issue": "문제 설명", "action": "요청 액션"}],
  "status": "normal|warning|critical"
}
`, 512)

    // 3. 결과 파싱 및 알림
    let parsed: { summary: string; issues: Array<{ agent: string; issue: string; action: string }>; status: string }
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: analysis, issues: [], status: 'normal' }
    } catch {
      parsed = { summary: analysis.slice(0, 200), issues: [], status: 'normal' }
    }

    // 미팅 기록
    await prisma.botLog.create({
      data: {
        botType: 'CEO' as const,
        action: 'MORNING_CYCLE',
        status: 'SUCCESS' as const,
        details: JSON.stringify({ kpi: { dau: todayUsers, posts: todayPosts, comments: todayComments, likes: todayLikes }, analysis: parsed }),
        itemCount: parsed.issues.length,
        executionTimeMs: 0,
      },
    })

    // critical이면 Slack 긴급 알림
    if (parsed.status === 'critical') {
      await notifySlack({
        level: 'critical',
        agent: 'CEO',
        title: '모닝 사이클 — 긴급 이슈 감지',
        body: parsed.summary,
      })
    }

    await notifyAdmin({
      level: parsed.status === 'critical' ? 'critical' : 'info',
      agent: 'CEO',
      title: '모닝 사이클 완료',
      body: `${parsed.summary}\nDAU: ${todayUsers} | 글: ${todayPosts} | 댓글: ${todayComments} | 공감: ${todayLikes}`,
    })

    return {
      agent: 'CEO',
      success: true,
      summary: parsed.summary,
      data: { dau: todayUsers, posts: todayPosts, comments: todayComments, likes: todayLikes, issues: parsed.issues },
    }
  }
}

// 직접 실행
const agent = new CEOMorningCycle()
agent.execute().then((result) => {
  console.log('[CEO] 모닝 사이클 완료:', result.summary)
  process.exit(result.success ? 0 : 1)
})
