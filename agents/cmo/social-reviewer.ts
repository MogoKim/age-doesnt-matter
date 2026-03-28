import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack, sendSlackMessage } from '../core/notifier.js'

/**
 * CMO Social Reviewer — 매주 월요일 10:00 KST 실행
 *
 * 지난 7일 실험 데이터를 분석하여:
 * 1. 통제군 vs 실험군 성과 비교
 * 2. 콘텐츠 유형/톤/시간/페르소나별 성과 랭킹
 * 3. 우승자 판별 + 인사이트 도출
 * 4. SocialExperiment.learnings 기록
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

interface StructuredLearnings {
  winner: 'control' | 'test' | 'inconclusive'
  confidence: 'high' | 'medium' | 'low'
  keyInsight: string
  recommendation: string
  retainStrategies: string[]
  deprecateStrategies: string[]
  nextExperimentSuggestion: string
}

interface PostMetrics {
  likes?: number
  replies?: number
  reposts?: number
  retweets?: number
  views?: number
  impressions?: number
  quotes?: number
  bookmarks?: number
}

function calcEngagement(m: PostMetrics): number {
  return (m.likes ?? 0) + (m.replies ?? 0) + (m.reposts ?? 0) + (m.retweets ?? 0) + (m.quotes ?? 0)
}

async function main() {
  console.log('[SocialReviewer] 시작')
  const startTime = Date.now()

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1. 지난 7일 게시물 조회
  const posts = await prisma.socialPost.findMany({
    where: { status: 'POSTED', postedAt: { gte: weekAgo } },
    include: { experiment: true },
  })

  if (posts.length === 0) {
    console.log('[SocialReviewer] 분석할 게시물 없음')
    await notifySlack({
      level: 'info',
      agent: 'CMO_SOCIAL',
      title: '주간 SNS 리뷰 — 데이터 없음',
      body: '지난 7일간 게시된 SNS 콘텐츠가 없습니다.',
    })
    await disconnect()
    return
  }

  // 2. 차원별 성과 집계
  const byContentType: Record<string, number[]> = {}
  const byTone: Record<string, number[]> = {}
  const byPersona: Record<string, number[]> = {}
  const bySlot: Record<string, number[]> = {}
  const byPromotion: Record<string, number[]> = {}
  const byPlatform: Record<string, number[]> = {}

  for (const post of posts) {
    const m = post.metrics as PostMetrics | null
    if (!m) continue
    const eng = calcEngagement(m)

    const push = (map: Record<string, number[]>, key: string) => {
      if (!map[key]) map[key] = []
      map[key].push(eng)
    }

    push(byContentType, post.contentType)
    if (post.tone) push(byTone, post.tone)
    if (post.personaId) push(byPersona, post.personaId)
    if (post.postingSlot) push(bySlot, post.postingSlot)
    push(byPromotion, post.promotionLevel)
    push(byPlatform, post.platform)
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const rankMap = (map: Record<string, number[]>) =>
    Object.entries(map)
      .map(([key, values]) => ({ key, avg: avg(values), count: values.length }))
      .sort((a, b) => b.avg - a.avg)

  const rankings = {
    contentType: rankMap(byContentType),
    tone: rankMap(byTone),
    persona: rankMap(byPersona),
    slot: rankMap(bySlot),
    promotion: rankMap(byPromotion),
    platform: rankMap(byPlatform),
  }

  // 3. 활성 실험 분석
  const activeExperiment = await prisma.socialExperiment.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })

  let experimentAnalysis = ''
  let expControlAvg = 0
  let expTestAvg = 0
  let expDelta = 'N/A'

  if (activeExperiment) {
    const controlPosts = posts.filter(
      p => p.experimentId === activeExperiment.id && getExperimentValue(p, activeExperiment.variable) === activeExperiment.controlValue
    )
    const testPosts = posts.filter(
      p => p.experimentId === activeExperiment.id && getExperimentValue(p, activeExperiment.variable) === activeExperiment.testValue
    )

    const controlEng = controlPosts.map(p => calcEngagement(p.metrics as PostMetrics ?? {}))
    const testEng = testPosts.map(p => calcEngagement(p.metrics as PostMetrics ?? {}))

    expControlAvg = avg(controlEng)
    expTestAvg = avg(testEng)
    const winner = expTestAvg > expControlAvg ? activeExperiment.testValue : activeExperiment.controlValue
    expDelta = expControlAvg > 0 ? ((expTestAvg - expControlAvg) / expControlAvg * 100).toFixed(1) : 'N/A'

    experimentAnalysis = `실험 "${activeExperiment.hypothesis}"\n변수: ${activeExperiment.variable}\n통제(${activeExperiment.controlValue}): 평균 ${expControlAvg.toFixed(1)} (${controlPosts.length}개)\n실험(${activeExperiment.testValue}): 평균 ${expTestAvg.toFixed(1)} (${testPosts.length}개)\n우승: ${winner} (${expDelta}% 차이)`
  }

  // 4. AI 인사이트 도출
  const summaryData = `
지난 7일 SNS 성과 분석 (총 ${posts.length}개 게시물):

콘텐츠 유형별 (평균 참여):
${rankings.contentType.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

톤별:
${rankings.tone.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

페르소나별:
${rankings.persona.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

시간대별:
${rankings.slot.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

홍보 레벨별:
${rankings.promotion.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

플랫폼별:
${rankings.platform.map(r => `  ${r.key}: ${r.avg.toFixed(1)} (${r.count}개)`).join('\n')}

${experimentAnalysis ? `\n현재 실험:\n${experimentAnalysis}` : '(활성 실험 없음)'}
`

  const aiResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: '당신은 50-60대 우리 또래 커뮤니티의 SNS 마케팅 분석가입니다. 데이터를 기반으로 실험 결과를 분석하세요. 한국어로.\n\n반드시 JSON으로만 응답:\n{\n  "winner": "control" 또는 "test" 또는 "inconclusive",\n  "confidence": "high" 또는 "medium" 또는 "low",\n  "keyInsight": "핵심 발견 1문장",\n  "recommendation": "다음 주에 할 것 1문장",\n  "retainStrategies": ["유지할 전략1", "유지할 전략2"],\n  "deprecateStrategies": ["폐기할 전략1"],\n  "nextExperimentSuggestion": "다음 실험 제안"\n}',
    messages: [{ role: 'user', content: summaryData }],
  })

  const rawText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '{}'
  const structuredLearnings: StructuredLearnings = JSON.parse(rawText)

  // 5. 실험 learnings 저장 + nextAction + 실험 결과 카드
  if (activeExperiment) {
    await prisma.socialExperiment.update({
      where: { id: activeExperiment.id },
      data: {
        learnings: JSON.stringify(structuredLearnings),
        nextAction: structuredLearnings.recommendation,
        status: 'ANALYZED',
        results: { controlAvg: expControlAvg, testAvg: expTestAvg, winner: structuredLearnings.winner, delta: expDelta },
      },
    })

    // #실험-보드 채널에 실험 결과 카드 전송
    await sendSlackMessage('EXPERIMENT', '', [
      { type: 'header', text: { type: 'plain_text', text: `실험 결과 — Week ${activeExperiment.weekNumber}`, emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*가설:*\n${activeExperiment.hypothesis}` },
        { type: 'mrkdwn', text: `*변수:*\n${activeExperiment.variable}` },
      ]},
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*통제군:*\n${activeExperiment.controlValue} (${expControlAvg.toFixed(1)})` },
        { type: 'mrkdwn', text: `*실험군:*\n${activeExperiment.testValue} (${expTestAvg.toFixed(1)})` },
      ]},
      { type: 'section', text: { type: 'mrkdwn', text: `*우승:* ${structuredLearnings.winner} (신뢰도: ${structuredLearnings.confidence})\n*인사이트:* ${structuredLearnings.keyInsight}\n*다음 액션:* ${structuredLearnings.recommendation}` } },
    ])
  }

  const durationMs = Date.now() - startTime

  // 6. BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'SOCIAL_REVIEW',
      status: 'SUCCESS',
      details: JSON.stringify({ postCount: posts.length, rankings, learnings: structuredLearnings }),
      itemCount: posts.length,
      executionTimeMs: durationMs,
    },
  })

  // 7. Slack 리포트
  const topContent = rankings.contentType[0]
  const topTone = rankings.tone[0]
  const topPersona = rankings.persona[0]

  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `주간 SNS 리뷰 — ${posts.length}개 분석 완료`,
    body: [
      `*분석 기간*: ${weekAgo.toLocaleDateString('ko-KR')} ~ ${new Date().toLocaleDateString('ko-KR')}`,
      `*총 게시물*: ${posts.length}개`,
      topContent ? `*최고 유형*: ${topContent.key} (평균 ${topContent.avg.toFixed(1)})` : '',
      topTone ? `*최고 톤*: ${topTone.key} (평균 ${topTone.avg.toFixed(1)})` : '',
      topPersona ? `*최고 페르소나*: ${topPersona.key} (평균 ${topPersona.avg.toFixed(1)})` : '',
      experimentAnalysis ? `\n*실험 결과*:\n${experimentAnalysis}` : '',
      `\n*AI 인사이트*:\n${structuredLearnings.keyInsight}\n*추천 액션*: ${structuredLearnings.recommendation}`,
    ].filter(Boolean).join('\n'),
  })

  console.log(`[SocialReviewer] 완료 — ${posts.length}개 분석, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

function getExperimentValue(post: { contentType: string; tone: string | null; personaId: string | null; postingSlot: string | null; promotionLevel: string; postText: string }, variable: string): string {
  switch (variable) {
    case 'contentType': return post.contentType
    case 'tone': return post.tone ?? ''
    case 'persona': return post.personaId ?? ''
    case 'postingTime': return post.postingSlot ?? ''
    case 'promotionLevel': return post.promotionLevel
    case 'format': return post.postText.length < 100 ? 'short' : post.postText.includes('\n') ? 'list' : 'long'
    case 'interaction': return post.postText.includes('?') || post.postText.includes('여러분') ? 'question' : 'statement'
    default: return ''
  }
}

main().catch(async (err) => {
  console.error('[SocialReviewer] 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO_SOCIAL',
    title: '주간 SNS 리뷰 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
