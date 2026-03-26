/**
 * 트렌드 분석기
 * 크롤링된 카페 글들을 Claude AI가 분석하여
 * 핫토픽, 키워드, 매거진 주제 추천, 페르소나 힌트 추출
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { TrendAnalysis } from './types.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()

/** 오늘 크롤링된 글 가져오기 */
async function getTodayPosts() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return prisma.cafePost.findMany({
    where: { crawledAt: { gte: todayStart } },
    orderBy: { likeCount: 'desc' },
    take: 100,
    select: {
      id: true,
      cafeId: true,
      cafeName: true,
      title: true,
      content: true,
      category: true,
      likeCount: true,
      commentCount: true,
      viewCount: true,
    },
  })
}

/** Claude에게 트렌드 분석 요청 */
async function analyzeTrends(posts: Awaited<ReturnType<typeof getTodayPosts>>): Promise<TrendAnalysis> {
  const postSummaries = posts.map((p, i) =>
    `[${i + 1}] (${p.cafeName}/${p.category ?? '일반'}) "${p.title}" — 좋아요 ${p.likeCount}, 댓글 ${p.commentCount}\n   ${p.content.slice(0, 200)}`,
  ).join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `당신은 5060 시니어 커뮤니티 트렌드 분석가입니다.
네이버 카페 3곳(우리가남이가, 실버사랑, 5060세대)에서 수집한 게시글을 분석합니다.

분석 목적:
1. 요즘 5060이 어떤 이야기를 하는지 파악
2. 우리 커뮤니티(우나어)에서 다룰 매거진 주제 추천
3. 새로운 페르소나(시드봇) 캐릭터 힌트 제공

반드시 아래 JSON 형식으로만 응답하세요.`,
    messages: [{
      role: 'user',
      content: `오늘 수집된 카페 게시글 ${posts.length}개를 분석해주세요.

${postSummaries}

응답 형식 (JSON):
{
  "hotTopics": [
    {"topic": "주제명", "count": 관련글수, "sentiment": "positive|neutral|negative", "examples": ["글제목1", "글제목2"]}
  ],
  "keywords": [
    {"word": "키워드", "frequency": 출현횟수}
  ],
  "sentimentMap": {"positive": 비율, "neutral": 비율, "negative": 비율},
  "magazineTopics": [
    {"title": "매거진 제목 제안", "reason": "추천 이유", "score": 1~10, "relatedPosts": ["글제목"]}
  ],
  "personaHints": [
    {"type": "관심사유형", "description": "이런 캐릭터가 있으면 좋겠다", "examplePosts": ["글제목"]}
  ]
}

hotTopics: 상위 5~7개, keywords: 상위 15개, magazineTopics: 상위 3개, personaHints: 2~3개`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // JSON 파싱 (코드블록 제거 + 첫 번째 JSON 객체 추출)
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned
  try {
    return JSON.parse(jsonStr) as TrendAnalysis
  } catch {
    console.error('[TrendAnalyzer] JSON 파싱 실패, 원본:', text.slice(0, 200))
    return {
      hotTopics: [],
      keywords: [],
      sentimentMap: { positive: 33, neutral: 34, negative: 33 },
      magazineTopics: [],
      personaHints: [],
    }
  }
}

/** 개별 글에 토픽 태그 + 감정 업데이트 */
async function tagPosts(posts: Awaited<ReturnType<typeof getTodayPosts>>, analysis: TrendAnalysis) {
  const topicWords = analysis.hotTopics.map(t => t.topic.toLowerCase())

  for (const post of posts) {
    const matchedTopics = topicWords.filter(topic =>
      post.title.toLowerCase().includes(topic) || post.content.toLowerCase().includes(topic),
    )

    // 인기글(좋아요 5+)은 콘텐츠 참고용으로 마킹
    const isUsable = post.likeCount >= 5 || post.commentCount >= 10

    await prisma.cafePost.update({
      where: { id: post.id },
      data: {
        topics: matchedTopics.length > 0 ? matchedTopics : [],
        isUsable,
      },
    })
  }
}

/** 트렌드 결과 DB 저장 */
async function saveTrend(analysis: TrendAnalysis, totalPosts: number, cafeSummary: Record<string, number>) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await prisma.cafeTrend.upsert({
    where: { date_period: { date: today, period: 'daily' } },
    create: {
      date: today,
      period: 'daily',
      hotTopics: JSON.parse(JSON.stringify(analysis.hotTopics)),
      keywords: JSON.parse(JSON.stringify(analysis.keywords)),
      sentimentMap: JSON.parse(JSON.stringify(analysis.sentimentMap)),
      magazineTopics: JSON.parse(JSON.stringify(analysis.magazineTopics)),
      personaHints: JSON.parse(JSON.stringify(analysis.personaHints)),
      totalPosts,
      cafeSummary: JSON.parse(JSON.stringify(cafeSummary)),
    },
    update: {
      hotTopics: JSON.parse(JSON.stringify(analysis.hotTopics)),
      keywords: JSON.parse(JSON.stringify(analysis.keywords)),
      sentimentMap: JSON.parse(JSON.stringify(analysis.sentimentMap)),
      magazineTopics: JSON.parse(JSON.stringify(analysis.magazineTopics)),
      personaHints: JSON.parse(JSON.stringify(analysis.personaHints)),
      totalPosts,
      cafeSummary: JSON.parse(JSON.stringify(cafeSummary)),
    },
  })
}

/** 매거진 추천 Slack 알림 */
async function notifyMagazineTopics(analysis: TrendAnalysis) {
  if (analysis.magazineTopics.length === 0) return

  const topicList = analysis.magazineTopics
    .map((t, i) => `${i + 1}. *${t.title}* (${t.score}/10)\n   └ ${t.reason}`)
    .join('\n\n')

  const hotList = analysis.hotTopics.slice(0, 5)
    .map(t => `• ${t.topic} (${t.count}건, ${t.sentiment})`)
    .join('\n')

  await notifySlack({
    level: 'info',
    agent: 'TREND_ANALYZER',
    title: '오늘의 5060 트렌드 분석',
    body: `🔥 *핫토픽*\n${hotList}\n\n📰 *매거진 주제 추천*\n${topicList}\n\n승인: /magazine\\_approve 1`,
  })
}

/** 메인 실행 */
async function main() {
  console.log('[TrendAnalyzer] 시작')
  const startTime = Date.now()

  // 1) 오늘 크롤링 글 조회
  const posts = await getTodayPosts()
  if (posts.length === 0) {
    console.log('[TrendAnalyzer] 오늘 수집된 글 없음 — 스킵')
    await disconnect()
    return
  }

  console.log(`[TrendAnalyzer] ${posts.length}개 글 분석 시작`)

  // 2) Claude AI 분석
  const analysis = await analyzeTrends(posts)
  console.log(`[TrendAnalyzer] 핫토픽 ${analysis.hotTopics.length}개, 키워드 ${analysis.keywords.length}개, 매거진 추천 ${analysis.magazineTopics.length}개`)

  // 3) 개별 글 태깅
  await tagPosts(posts, analysis)

  // 4) 카페별 수집 수 요약
  const cafeSummary: Record<string, number> = {}
  for (const post of posts) {
    cafeSummary[post.cafeId] = (cafeSummary[post.cafeId] ?? 0) + 1
  }

  // 5) DB 저장
  await saveTrend(analysis, posts.length, cafeSummary)

  // 6) 텔레그램 알림
  await notifyMagazineTopics(analysis)

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'TREND_ANALYSIS',
      status: 'SUCCESS',
      details: JSON.stringify({
        postsAnalyzed: posts.length,
        hotTopics: analysis.hotTopics.length,
        magazineTopics: analysis.magazineTopics.length,
      }),
      itemCount: analysis.hotTopics.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[TrendAnalyzer] 완료 — ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[TrendAnalyzer] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'TREND_ANALYZER',
    title: '트렌드 분석 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
