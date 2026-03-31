import { BaseAgent } from '../core/agent.js'
import { prisma, disconnect } from '../core/db.js'
import { sendSlackMessage } from '../core/notifier.js'
import { getDayStrategy } from '../cmo/threads-config.js'
import type { AgentResult } from '../core/types.js'

/**
 * CEO 에이전트 — SNS 일일 브리핑
 * 매일 08:30 KST 실행: 어제 SNS 성과 분석 + 오늘 계획 보고
 */
class MorningSNSBriefing extends BaseAgent {
  constructor() {
    super({
      name: 'CEO',
      botType: 'CEO',
      role: 'CEO -- SNS 일일 브리핑',
      model: 'light',
      tasks: '매일 아침 SNS 실험 결과 요약 + 오늘 계획 보고',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = new Date()
    const dateStr = now.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })

    // ── 1. 어제 게시된 SocialPost 전부 조회 ──
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const posts = await prisma.socialPost.findMany({
      where: { status: 'POSTED', postedAt: { gte: yesterday } },
      orderBy: { postedAt: 'desc' },
    })

    // 게시물이 0개인 경우 빈 보고서 처리
    if (posts.length === 0) {
      const emptyMessage = '어제 게시된 SNS 게시물이 없습니다.'

      await sendSlackMessage('DASHBOARD', `SNS 일일 브리핑 -- ${dateStr}`, [
        { type: 'header', text: { type: 'plain_text', text: `SNS 일일 브리핑 -- ${dateStr}`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `*어제 성과:* 게시물 0개` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*참고:* ${emptyMessage}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `자동 생성 by CEO 에이전트 | ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }] },
      ])

      return {
        agent: 'CEO',
        success: true,
        summary: emptyMessage,
        data: { postsCount: 0 },
      }
    }

    // ── 2. 메트릭 분석 ──
    interface PostMetrics {
      likes: number
      replies: number
      reposts: number
      views: number
    }

    interface PostWithEngagement {
      id: string
      contentType: string
      tone: string | null
      persona: string | null
      slot: string | null
      content: string
      engagement: number
      metrics: PostMetrics
    }

    const postsWithEngagement: PostWithEngagement[] = posts.map((post) => {
      const metrics = (post.metrics as PostMetrics | null) ?? { likes: 0, replies: 0, reposts: 0, views: 0 }
      const engagement = (metrics.likes ?? 0) + (metrics.replies ?? 0) + (metrics.reposts ?? 0)

      return {
        id: post.id,
        contentType: post.contentType,
        tone: post.tone,
        persona: post.personaId,
        slot: post.postingSlot,
        content: post.postText,
        engagement,
        metrics,
      }
    })

    const totalEngagement = postsWithEngagement.reduce((sum, p) => sum + p.engagement, 0)

    // 성공 상위 3개
    const sorted = [...postsWithEngagement].sort((a, b) => b.engagement - a.engagement)
    const topPosts = sorted.slice(0, 3)
    const bottomPosts = sorted.slice(-3).reverse()

    const formatPostSummary = (p: PostWithEngagement, rank: number): string => {
      const snippet = p.content.length > 40 ? p.content.slice(0, 40) + '...' : p.content
      const meta = [p.contentType, p.tone, p.persona, p.slot].filter(Boolean).join(' / ')
      return `${rank}. "${snippet}" (${p.engagement} engagement${meta ? ` | ${meta}` : ''})`
    }

    const topPostsSummary = topPosts.map((p, i) => formatPostSummary(p, i + 1)).join('\n')
    const bottomPostsSummary = bottomPosts.map((p, i) => formatPostSummary(p, i + 1)).join('\n')

    // ── 3. 오늘의 실험 계획 ──
    const activeExperiments = await prisma.socialExperiment.findMany({
      where: { status: 'ACTIVE' },
    })

    const dayStrategy = getDayStrategy(new Date())

    const experimentSummary = activeExperiments.length > 0
      ? activeExperiments.map((e) => `- [${e.variable}] ${e.hypothesis}`).join('\n')
      : '진행 중인 실험 없음'

    const todayPlan = [
      `*요일 전략:* ${dayStrategy.dayName} -- ${dayStrategy.mood}`,
      `*콘텐츠 유형:* ${dayStrategy.contentTypes.join(', ')}`,
      `*포맷:* ${dayStrategy.format}`,
      `*토픽 방향:* #${dayStrategy.topicTagHint}`,
      `*활성 실험:*\n${experimentSummary}`,
    ].join('\n')

    // ── 4. AI 분석 (haiku, max_tokens: 500) ──
    const analysisPrompt = `
아래 SNS 어제 성과 데이터를 분석해줘.

[어제 게시물 현황]
- 총 ${posts.length}개 게시, 총 참여도 ${totalEngagement}

[성공 TOP 3]
${topPostsSummary}

[부진 하위 3]
${bottomPostsSummary}

[오늘 요일 전략]
- ${dayStrategy.dayName}: ${dayStrategy.mood}
- 콘텐츠 유형: ${dayStrategy.contentTypes.join(', ')}

분석 요청:
1. 성공/실패 요인 분석 (콘텐츠 유형, 톤, 시간대 관점)
2. 오늘 콘텐츠 방향 제안 (구체적으로)

간결하게 3-5줄로 요약해줘.
`

    const aiAnalysis = await this.chat(analysisPrompt, 500)

    // ── 5. 창업자 의사결정 필요 사항 ──
    const pendingItems = await prisma.adminQueue.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // ── 6. Slack 블록 전송 ──
    await sendSlackMessage('DASHBOARD', `SNS 일일 브리핑 -- ${dateStr}`, [
      { type: 'header', text: { type: 'plain_text', text: `SNS 일일 브리핑 -- ${dateStr}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*어제 성과:* ${posts.length}개 게시, 총 참여 ${totalEngagement}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*성공 TOP:*\n${topPostsSummary}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*개선 필요:*\n${bottomPostsSummary}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*오늘 계획:*\n${todayPlan}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*AI 분석:*\n${aiAnalysis}` } },
      ...(pendingItems.length > 0
        ? [{ type: 'section', text: { type: 'mrkdwn', text: `*결정 요청:*\n${pendingItems.map((i) => `- ${i.title}`).join('\n')}` } }]
        : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `자동 생성 by CEO 에이전트 | ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }] },
    ])

    // ── 7. BotLog 기록은 BaseAgent가 자동 처리 ──

    return {
      agent: 'CEO',
      success: true,
      summary: `SNS 일일 브리핑 완료: ${posts.length}개 게시물, 총 참여 ${totalEngagement}`,
      data: {
        postsCount: posts.length,
        totalEngagement,
        topPosts: topPosts.map((p) => ({ id: p.id, engagement: p.engagement })),
        activeExperiments: activeExperiments.length,
        pendingDecisions: pendingItems.length,
      },
    }
  }
}

// 직접 실행
const briefing = new MorningSNSBriefing()
briefing.execute().then(() => {
  disconnect()
}).catch(async (err) => {
  console.error('[MorningSNSBriefing] 오류:', err)
  await disconnect()
  process.exit(1)
})
