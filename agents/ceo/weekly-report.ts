import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { sendSlackMessage, notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CEO 에이전트 — 주간 리포트
 * 매주 월요일 10:00 KST 실행
 * 지난 7일간 KPI 종합 → #주간-리포트 채널 전송
 */
class CEOWeeklyReport extends BaseAgent {
  constructor() {
    super({
      name: 'CEO',
      botType: 'CEO',
      role: 'CEO (최고경영자)',
      model: 'light',
      tasks: '주간 리포트: 7일간 KPI 종합, 트렌드, 에이전트 성과 분석',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    // 1. 이번 주 / 지난 주 KPI 수집
    const [
      thisWeekUsers, lastWeekUsers,
      thisWeekPosts, lastWeekPosts,
      thisWeekComments, lastWeekComments,
      thisWeekLikes, lastWeekLikes,
      thisWeekJobs,
      totalUsers, totalPosts,
    ] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.post.count({ where: { createdAt: { gte: weekAgo }, status: 'PUBLISHED' } }),
      prisma.post.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo }, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.comment.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.like.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.like.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.post.count({ where: { boardType: 'JOB', createdAt: { gte: weekAgo }, source: 'BOT' } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
    ])

    // 2. SNS 성과
    const [snsPostCount, snsExperiment] = await Promise.all([
      prisma.socialPost.count({ where: { status: 'POSTED', postedAt: { gte: weekAgo } } }),
      prisma.socialExperiment.findFirst({
        where: { status: { in: ['ACTIVE', 'ANALYZED'] } },
        orderBy: { createdAt: 'desc' },
        select: { weekNumber: true, variable: true, hypothesis: true, status: true, learnings: true },
      }),
    ])

    // 최신 전략 메모 (social-strategy가 월요일에 생성)
    const strategyMemo = await prisma.botLog.findFirst({
      where: { botType: 'CMO', action: 'STRATEGY_MEMO' },
      orderBy: { executedAt: 'desc' },
      select: { details: true, executedAt: true },
    })

    const snsPosts = await prisma.socialPost.findMany({
      where: { status: 'POSTED', postedAt: { gte: weekAgo }, metricsUpdatedAt: { not: null } },
      select: { platform: true, metrics: true },
    })

    let totalEngagement = 0
    const platformEngagement: Record<string, number> = {}
    for (const sp of snsPosts) {
      const m = sp.metrics as Record<string, number> | null
      if (!m) continue
      const eng = (m.likes ?? 0) + (m.replies ?? 0) + (m.reposts ?? m.retweets ?? 0)
      totalEngagement += eng
      platformEngagement[sp.platform] = (platformEngagement[sp.platform] ?? 0) + eng
    }

    // 3. 에이전트 성과
    const agentLogs = await prisma.botLog.findMany({
      where: { executedAt: { gte: weekAgo } },
      select: { botType: true, status: true },
    })

    const agentStats: Record<string, { success: number; fail: number }> = {}
    for (const log of agentLogs) {
      if (!agentStats[log.botType]) agentStats[log.botType] = { success: 0, fail: 0 }
      if (log.status === 'SUCCESS') agentStats[log.botType].success++
      else agentStats[log.botType].fail++
    }

    const agentSummary = Object.entries(agentStats)
      .map(([type, s]) => {
        const total = s.success + s.fail
        const rate = total > 0 ? Math.round((s.success / total) * 100) : 0
        return `  ${type}: ${total}회 (성공률 ${rate}%)`
      })
      .join('\n')

    // 3. 변화율 계산
    const pctChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? '+100%' : '0%'
      const change = ((curr - prev) / prev * 100).toFixed(1)
      return Number(change) >= 0 ? `+${change}%` : `${change}%`
    }

    const changeEmoji = (curr: number, prev: number) =>
      curr > prev ? ':chart_with_upwards_trend:' : curr < prev ? ':chart_with_downwards_trend:' : ':arrow_right:'

    // 4. AI 종합 분석
    const analysis = await this.chat(`
아래는 이번 주 우나어(50·60대 커뮤니티) KPI입니다. 짧게 2-3문장으로 핵심을 요약하세요.

- 활성 유저: ${thisWeekUsers}명 (전주 ${lastWeekUsers}명)
- 신규 게시글: ${thisWeekPosts}건 (전주 ${lastWeekPosts}건)
- 댓글: ${thisWeekComments}건 (전주 ${lastWeekComments}건)
- 공감: ${thisWeekLikes}건 (전주 ${lastWeekLikes}건)
- 일자리 수집: ${thisWeekJobs}건
- SNS 게시: ${snsPostCount}건 (참여 ${totalEngagement})
- 에이전트 실행: ${agentLogs.length}회
${snsExperiment ? `- 현재 실험: ${snsExperiment.hypothesis} (${snsExperiment.status})` : ''}

한국어로, 핵심만 간결하게.
`, 256)

    // 5. 비용 추산
    const heavyAgents = new Set(['CEO', 'CMO', 'CPO', 'COO'])
    let weekCost = 0
    for (const log of agentLogs) {
      weekCost += heavyAgents.has(log.botType) ? 0.01 : 0.001
    }

    // 6. 주간 리포트 Slack 전송
    const weekRange = `${weekAgo.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })} ~ ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}`

    await sendSlackMessage('WEEKLY_REPORT', '', [
      { type: 'header', text: { type: 'plain_text', text: `CEO 주간 리포트 (${weekRange})`, emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:bar_chart: 핵심 KPI*` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*활성 유저*\n${thisWeekUsers}명 ${changeEmoji(thisWeekUsers, lastWeekUsers)} ${pctChange(thisWeekUsers, lastWeekUsers)}` },
          { type: 'mrkdwn', text: `*신규 게시글*\n${thisWeekPosts}건 ${changeEmoji(thisWeekPosts, lastWeekPosts)} ${pctChange(thisWeekPosts, lastWeekPosts)}` },
          { type: 'mrkdwn', text: `*댓글*\n${thisWeekComments}건 ${changeEmoji(thisWeekComments, lastWeekComments)} ${pctChange(thisWeekComments, lastWeekComments)}` },
          { type: 'mrkdwn', text: `*공감*\n${thisWeekLikes}건 ${changeEmoji(thisWeekLikes, lastWeekLikes)} ${pctChange(thisWeekLikes, lastWeekLikes)}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:briefcase: 일자리 수집*: ${thisWeekJobs}건\n*:busts_in_silhouette: 전체 유저*: ${totalUsers}명\n*:page_facing_up: 전체 게시글*: ${totalPosts}건` },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:mega: SNS 마케팅*` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*게시물*\n${snsPostCount}개` },
          { type: 'mrkdwn', text: `*총 참여*\n${totalEngagement}` },
          ...Object.entries(platformEngagement).map(([p, e]) => ({ type: 'mrkdwn' as const, text: `*${p}*\n참여 ${e}` })),
        ],
      },
      ...(snsExperiment ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*실험 Week ${snsExperiment.weekNumber}*: ${snsExperiment.hypothesis}\n상태: ${snsExperiment.status}${snsExperiment.learnings ? `\n인사이트: ${snsExperiment.learnings.slice(0, 200)}` : ''}` },
      }] : []),
      ...(strategyMemo?.details ? (() => {
        const memo = typeof strategyMemo.details === 'string'
          ? JSON.parse(strategyMemo.details) as { weekNumber?: number; strategy?: string }
          : strategyMemo.details as { weekNumber?: number; strategy?: string }
        return memo.strategy ? [{
          type: 'section' as const,
          text: { type: 'mrkdwn' as const, text: `*:clipboard: 금주 전략 (Week ${memo.weekNumber ?? '?'})*\n${memo.strategy.slice(0, 300)}${memo.strategy.length > 300 ? '...' : ''}` },
        }] : []
      })() : []),
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:robot_face: 에이전트 성과*\n\`\`\`\n${agentSummary}\n\`\`\`` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:moneybag: 주간 비용*: $${weekCost.toFixed(2)}` },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*:brain: AI 분석*\n${analysis}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `자동 생성 by CEO 에이전트 | ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }],
      },
    ])

    // 7. 로그 기록
    await prisma.botLog.create({
      data: {
        botType: 'CEO',
        action: 'WEEKLY_REPORT',
        status: 'SUCCESS',
        details: JSON.stringify({
          kpi: { users: thisWeekUsers, posts: thisWeekPosts, comments: thisWeekComments, likes: thisWeekLikes, jobs: thisWeekJobs },
          cost: weekCost,
          analysis,
        }),
        itemCount: agentLogs.length,
        executionTimeMs: 0,
      },
    })

    return {
      agent: 'CEO',
      success: true,
      summary: `주간 리포트 발송 완료 — 유저 ${thisWeekUsers}명, 게시글 ${thisWeekPosts}건`,
      data: { thisWeekUsers, thisWeekPosts, thisWeekComments, thisWeekLikes, weekCost },
    }
  }
}

// 직접 실행
const agent = new CEOWeeklyReport()
agent.execute().then((result) => {
  console.log('[CEO] 주간 리포트 완료:', result.summary)
  process.exit(result.success ? 0 : 1)
})
