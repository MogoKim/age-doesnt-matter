import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin, notifySlack, sendSlackMessage } from '../core/notifier.js'
import { loadTodayBrief } from '../core/intelligence.js'
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
      model: 'heavy',
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

    // 2. 욕망 지도 로드
    const brief = await loadTodayBrief({ fallbackToPrevious: true })
    const desireMapSection = brief
      ? `
[오늘의 커뮤니티 욕망 지도]
- 지배적 욕망: ${brief.dominantDesire ?? '분포 고름'}
- 주된 감정: ${brief.dominantEmotion ?? '복합'}
- 욕망 상위 3개: ${brief.desireRanking.slice(0, 3).map(d => `${d.label}(${d.percent.toFixed(0)}%)`).join(' / ')}
- 긴급 토픽: ${brief.urgentTopics.slice(0, 2).map(t => t.topic).join(' / ') || '없음'}
- 콘텐츠 방향: ${brief.contentDirective.primaryTheme}${brief.entertainActive ? `\n- 엔터 활성: ENTERTAIN ${brief.entertainPct.toFixed(0)}%` : ''}${brief.date !== new Date().toISOString().slice(0, 10) ? '\n  ⚠️ 어제 데이터 기반 (오늘 크롤링 미완료)' : ''}
`
      : '\n[욕망 지도] 오늘 데이터 없음 (크롤링 대기 중)\n'

    // 3. AI 분석
    const kpiSummary = `
[일일 KPI 현황]
- DAU(어제 로그인): ${todayUsers}명 (전일 대비 ${dauChange}%)
- 전체 게시글: ${totalPosts}건
- 어제 신규 글: ${todayPosts}건
- 어제 댓글: ${todayComments}건
- 어제 공감: ${todayLikes}건
`

    const analysis = await this.chat(`
아래 KPI와 오늘의 커뮤니티 욕망 지도를 함께 분석하고, 문제가 있다면 어떤 에이전트에게 어떤 액션을 배정할지 JSON으로 응답하세요.
문제가 없다면 빈 배열로 응답하세요.

[우나어 포지셔닝 — 액션 판단 기준]
- RELATION(연결·외로움): 왜 오는가 — 공감/위로/수다 콘텐츠 부족 시 CMO 강화
- RETIRE+MONEY(인생2막+노후): 머무르는 이유 — 2막준비 게시판 활성도 체크
- HEALTH(건강): 정보 소비형 — 매거진 커버리지 확인
- 핵심 메시지: "혼자 끙끙 앓던 그 고민 — 여기 다 있어요. 인생 다음 챕터, 같이 준비해요."

${kpiSummary}${desireMapSection}

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

    // #일일-브리핑 채널에 리포트 전송
    const statusEmoji = parsed.status === 'critical' ? ':red_circle:' : parsed.status === 'warning' ? ':large_orange_circle:' : ':large_green_circle:'
    const issueText = parsed.issues.length > 0
      ? parsed.issues.map((i) => `  - *${i.agent}*: ${i.issue} → ${i.action}`).join('\n')
      : '  이슈 없음'

    const dateStr = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

    await sendSlackMessage('DASHBOARD', '', [
      { type: 'header', text: { type: 'plain_text', text: `CEO 일일 브리핑 — ${dateStr}`, emoji: true } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*DAU*\n${todayUsers}명 (${dauChange}%)` },
          { type: 'mrkdwn', text: `*신규 게시글*\n${todayPosts}건` },
          { type: 'mrkdwn', text: `*댓글*\n${todayComments}건` },
          { type: 'mrkdwn', text: `*공감*\n${todayLikes}건` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*상태:* ${statusEmoji} ${parsed.status}\n*요약:* ${parsed.summary}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*감지된 이슈:*\n${issueText}` } },
      ...(brief ? [{
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*오늘 커뮤니티 욕망:* ${brief.dominantDesire ?? '분포 고름'} | *주된 감정:* ${brief.dominantEmotion ?? '복합'}\n${brief.desireRanking.slice(0, 3).map(d => `${d.label} ${d.percent.toFixed(0)}%`).join(' · ')}${brief.entertainActive ? ` · ENTERTAIN ${brief.entertainPct.toFixed(0)}%` : ''}`,
        },
      }] : []),
      { type: 'divider' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `전체 게시글: ${totalPosts}건 | 자동 생성 by CEO 에이전트` }] },
    ])

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
