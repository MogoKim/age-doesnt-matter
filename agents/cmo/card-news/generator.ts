/**
 * Card News Generator — AI 기반 카드뉴스 콘텐츠 생성 + 렌더링 파이프라인
 *
 * 흐름:
 * 1. CafeTrend 데이터로 주제 선택
 * 2. 요일별 cardNewsType 로테이션
 * 3. Claude Haiku로 슬라이드 콘텐츠 JSON 생성
 * 4. renderer.ts로 이미지 렌더링 + R2 업로드
 * 5. BotLog + Slack 알림
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../../core/db.js'
import { notifySlack } from '../../core/notifier.js'
import { renderCardNews, type SlideData, type RenderResult } from './renderer.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()
// ─── Types ───

type CardNewsType = 'NEWS_TREND' | 'INFO_TOPIC' | 'COMMUNITY_PROMO'

interface GenerateResult {
  cardNewsType: CardNewsType
  slides: SlideData[]
  topic: string
  sourcePostIds: string[]
}

// ─── Day-of-Week Rotation ───

function getCardNewsTypeForToday(): CardNewsType {
  const kstDay = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  ).getDay()

  // Mon(1), Wed(3), Fri(5) = news-trend
  // Tue(2), Thu(4) = info-topic
  // Sat(6), Sun(0) = community
  switch (kstDay) {
    case 1:
    case 3:
    case 5:
      return 'NEWS_TREND'
    case 2:
    case 4:
      return 'INFO_TOPIC'
    default:
      return 'COMMUNITY_PROMO'
  }
}

// ─── Data Fetching ───

interface CafeTrendData {
  hotTopics: Array<{ topic: string; count: number; sentiment: string; examples: string[] }>
  keywords: Array<{ word: string; frequency: number }>
  magazineTopics: Array<{ title: string; reason: string; score: number }>
}

async function getTodayTrend(): Promise<CafeTrendData | null> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const trend = await prisma.cafeTrend.findFirst({
    where: { date: { gte: today } },
    orderBy: { createdAt: 'desc' },
  })

  if (!trend) {
    // Fallback: latest trend within 3 days
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    threeDaysAgo.setHours(0, 0, 0, 0)

    const fallback = await prisma.cafeTrend.findFirst({
      where: { date: { gte: threeDaysAgo } },
      orderBy: { createdAt: 'desc' },
    })

    if (!fallback) return null
    return {
      hotTopics: fallback.hotTopics as CafeTrendData['hotTopics'],
      keywords: fallback.keywords as CafeTrendData['keywords'],
      magazineTopics: fallback.magazineTopics as CafeTrendData['magazineTopics'],
    }
  }

  return {
    hotTopics: trend.hotTopics as CafeTrendData['hotTopics'],
    keywords: trend.keywords as CafeTrendData['keywords'],
    magazineTopics: trend.magazineTopics as CafeTrendData['magazineTopics'],
  }
}

interface PopularPost {
  id: string
  title: string
  content: string
  boardType: string
  likeCount: number
  author: { nickname: string | null } | null
}

async function getPopularCommunityPosts(): Promise<PopularPost[]> {
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  return prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: threeDaysAgo },
      likeCount: { gte: 2 },
      boardType: { in: ['STORY', 'HUMOR', 'WEEKLY'] },
    },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      content: true,
      boardType: true,
      likeCount: true,
      author: { select: { nickname: true } },
    },
  })
}

// ─── AI Content Generation ───

interface AISlideContent {
  slides: Array<{
    type: 'cover' | 'content' | 'summary' | 'cta'
    title: string
    subtitle?: string
    body?: string
    bulletPoints?: string[]
    ctaText?: string
    // community
    postTitle?: string
    postAuthor?: string
    postSnippet?: string
  }>
  topic: string
}

async function generateSlideContent(
  cardNewsType: CardNewsType,
  trendData: CafeTrendData | null,
  communityPosts: PopularPost[],
): Promise<AISlideContent> {
  const topicsContext = trendData
    ? `오늘의 트렌드:\n${trendData.hotTopics.slice(0, 5).map((t) => `- ${t.topic} (${t.count}건, 분위기: ${t.sentiment})`).join('\n')}\n\n인기 키워드: ${trendData.keywords.slice(0, 10).map((k) => k.word).join(', ')}`
    : '트렌드 데이터 없음 — 50-60대가 관심있는 보편적 주제로 생성'

  const communityContext =
    communityPosts.length > 0
      ? `\n\n인기 커뮤니티 글:\n${communityPosts.map((p) => `- "${p.title}" by ${p.author?.nickname ?? '익명'} (공감 ${p.likeCount})\n  내용: ${p.content.replace(/<[^>]*>/g, '').slice(0, 100)}`).join('\n')}`
      : ''

  const typeInstructions: Record<CardNewsType, string> = {
    NEWS_TREND: `뉴스/트렌드 카드뉴스를 만들어주세요.
- 50-60대에게 유용한 최신 트렌드 정보
- 데이터 기반 정보 전달 (숫자, 통계 포함)
- 핵심 포인트를 명확히 전달`,

    INFO_TOPIC: `정보/생활 카드뉴스를 만들어주세요.
- 건강, 재테크, 취미, 여행 등 실용 정보
- 50-60대가 바로 활용할 수 있는 팁
- 따뜻하고 읽기 쉬운 톤`,

    COMMUNITY_PROMO: `커뮤니티 홍보 카드뉴스를 만들어주세요.
- 인기 커뮤니티 글을 소개하며 커뮤니티 분위기를 전달
- 실제 글 제목과 작성자를 활용 (postTitle, postAuthor, postSnippet 필드)
- "우리 또래가 함께 나누는 이야기" 분위기`,
  }

  const communitySlideNote =
    cardNewsType === 'COMMUNITY_PROMO'
      ? `
- content 타입 슬라이드에서 postTitle, postAuthor, postSnippet 필드를 사용하여 실제 커뮤니티 글을 소개
- postSnippet은 글 내용 요약 (50자 이내)`
      : ''

  const systemPrompt = `당신은 "우리 나이가 어때서" 커뮤니티(age-doesnt-matter.com)의 카드뉴스 콘텐츠 생성기입니다.

대상: 50대, 60대 (절대 "시니어" 용어 사용 금지)
톤: 따뜻하고 친근하며, 존댓말 사용, 쉬운 표현

${typeInstructions[cardNewsType]}

카드뉴스 구성 (5장):
1. cover: 눈길을 끄는 제목 + 부제
2. content: 핵심 내용 1 (본문 또는 불릿 포인트)
3. content: 핵심 내용 2 (본문 또는 불릿 포인트)
4. summary: 핵심 요약 (불릿 포인트 3-4개)
5. cta: 행동 유도 (제목 + 부제 + ctaText 버튼 텍스트)
${communitySlideNote}

규칙:
- title: 최대 25자 (cover는 20자)
- subtitle: 최대 40자
- body: 최대 100자
- bulletPoints: 각 항목 30자 이내, 최대 4개
- ctaText: 최대 12자 (예: "함께 이야기해요", "지금 둘러보기")
- 정치/종교/혐오 절대 금지
- 큰 글씨로 읽기 쉽게, 핵심만 간결하게

반드시 JSON으로만 응답:
{
  "topic": "주제 요약 (10자 이내)",
  "slides": [
    {"type": "cover", "title": "...", "subtitle": "..."},
    {"type": "content", "title": "...", "body": "...", "bulletPoints": ["...", "..."]},
    {"type": "content", "title": "...", "body": "...", "bulletPoints": ["...", "..."]},
    {"type": "summary", "title": "...", "bulletPoints": ["...", "...", "..."]},
    {"type": "cta", "title": "...", "subtitle": "...", "ctaText": "..."}
  ]
}`

  const userContent = `${topicsContext}${communityContext}\n\n위 데이터를 바탕으로 ${cardNewsType === 'NEWS_TREND' ? '뉴스/트렌드' : cardNewsType === 'INFO_TOPIC' ? '정보/생활' : '커뮤니티 홍보'} 카드뉴스 5장을 JSON으로 생성해주세요.`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(jsonStr) as AISlideContent
    return parsed
  } catch (err) {
    console.error('[CardNewsGenerator] AI JSON 파싱 실패:', jsonStr.slice(0, 300))
    throw new Error(
      `AI 콘텐츠 JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ─── Main Export ───

export async function generateCardNewsContent(): Promise<GenerateResult> {
  const cardNewsType = getCardNewsTypeForToday()
  console.log(`[CardNewsGenerator] 오늘의 타입: ${cardNewsType}`)

  // Fetch data
  const [trendData, communityPosts] = await Promise.all([
    getTodayTrend(),
    getPopularCommunityPosts(),
  ])

  console.log(
    `[CardNewsGenerator] 데이터: trend=${trendData ? 'OK' : 'N/A'}, posts=${communityPosts.length}개`,
  )

  // Generate AI content
  const aiContent = await generateSlideContent(cardNewsType, trendData, communityPosts)

  // Build slides with numbering
  const totalSlides = aiContent.slides.length
  const slides: SlideData[] = aiContent.slides.map((s, i) => ({
    type: s.type,
    title: s.title,
    subtitle: s.subtitle,
    body: s.body,
    bulletPoints: s.bulletPoints,
    ctaText: s.ctaText,
    slideNumber: i + 1,
    totalSlides,
    postTitle: s.postTitle,
    postAuthor: s.postAuthor,
    postSnippet: s.postSnippet,
  }))

  // Collect source post IDs for community type
  const sourcePostIds =
    cardNewsType === 'COMMUNITY_PROMO' ? communityPosts.map((p) => p.id) : []

  return {
    cardNewsType,
    slides,
    topic: aiContent.topic,
    sourcePostIds,
  }
}

// ─── Main Runner ───

async function main() {
  console.log('[CardNews] 파이프라인 시작')
  const startTime = Date.now()

  // 1. Generate content
  const { cardNewsType, slides, topic, sourcePostIds } = await generateCardNewsContent()
  console.log(`[CardNews] 콘텐츠 생성 완료: "${topic}" (${slides.length}장)`)

  // 2. Render images
  let renderResult: RenderResult
  try {
    renderResult = await renderCardNews(cardNewsType, slides)
    console.log(`[CardNews] 이미지 렌더링 완료: ${renderResult.imageUrls.length}장`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[CardNews] 렌더링 실패:', message)
    await notifySlack({
      level: 'important',
      agent: 'CMO',
      title: '카드뉴스 렌더링 실패',
      body: `주제: ${topic}\n타입: ${cardNewsType}\n오류: ${message}`,
    })
    await disconnect()
    process.exit(1)
  }

  // 3. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CARD_NEWS_GENERATE',
      status: 'SUCCESS',
      details: JSON.stringify({
        cardNewsType,
        topic,
        slideCount: slides.length,
        imageUrls: renderResult.imageUrls,
        thumbnailUrl: renderResult.thumbnailUrl,
        sourcePostIds,
      }),
      itemCount: slides.length,
      executionTimeMs: durationMs,
    },
  })

  // 4. Slack notification
  const typeLabel =
    cardNewsType === 'NEWS_TREND'
      ? '뉴스/트렌드'
      : cardNewsType === 'INFO_TOPIC'
        ? '정보/생활'
        : '커뮤니티 홍보'

  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: `카드뉴스 생성 완료 — ${typeLabel}`,
    body: [
      `*주제*: ${topic}`,
      `*타입*: ${typeLabel} (${cardNewsType})`,
      `*슬라이드*: ${renderResult.imageUrls.length}장`,
      `*썸네일*: ${renderResult.thumbnailUrl}`,
      `*이미지 URLs*:\n${renderResult.imageUrls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}`,
      sourcePostIds.length > 0
        ? `*참조 게시글*: ${sourcePostIds.length}건`
        : '',
      `*소요*: ${Math.round(durationMs / 1000)}초`,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  console.log(
    `[CardNews] 파이프라인 완료 — ${typeLabel} "${topic}", ${renderResult.imageUrls.length}장, ${Math.round(durationMs / 1000)}초`,
  )

  await disconnect()
}

main().catch(async (err) => {
  console.error('[CardNews] 파이프라인 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '카드뉴스 파이프라인 실패',
    body: err instanceof Error ? err.message : String(err),
  }).catch(() => {})
  await disconnect().catch(() => {})
  process.exit(1)
})
