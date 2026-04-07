/**
 * Card News Generator v2 — AI 기반 카드뉴스 콘텐츠 생성 파이프라인
 *
 * v2 변경점:
 * - 5장 고정 → 6-10장 유동 슬라이드
 * - Haiku → Sonnet (고객 대면 콘텐츠)
 * - 리서치 입력 (Perplexity + Claude 구조화)
 * - 11종 슬라이드 타입 풀
 * - 6-카테고리 요일 로테이션
 *
 * 흐름:
 * 1. 요일별 카테고리 결정
 * 2. CafeTrend + 커뮤니티 인기글 조회
 * 3. researchTopic()으로 팩트/통계/인용 수집
 * 4. Claude Sonnet으로 6-10장 슬라이드 JSON 생성
 * 5. renderer.ts로 이미지 렌더링 + R2 업로드
 * 6. BotLog + Slack 알림
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../../core/db.js'
import { notifySlack } from '../../core/notifier.js'
import { researchTopic, type ResearchBrief } from './researcher.js'
import { renderCardNewsV2, type CardNewsSlideData, type RenderResult } from './renderer.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()

// ─── Types ───

export type SlideType =
  | 'hook'
  | 'context'
  | 'stat'
  | 'story'
  | 'tip'
  | 'comparison'
  | 'quote'
  | 'listicle'
  | 'stepguide'
  | 'summary'
  | 'cta'

export type ContentCategory =
  | 'WELLNESS'
  | 'PRACTICAL'
  | 'COMMUNITY'
  | 'LIFESTYLE'
  | 'GROWTH'
  | 'TRENDING'

export interface CardNewsSlide {
  slideType: SlideType
  title: string
  body?: string
  bulletPoints?: string[]
  statNumber?: string
  statLabel?: string
  stepNumber?: number
  stepTotal?: number
  listRank?: number
  imagePrompt?: string
  imageStyle?: string
  ctaText?: string
  ctaUrl?: string
  icon?: string
  leftLabel?: string
  leftText?: string
  rightLabel?: string
  rightText?: string
  attribution?: string
}

export interface CardNewsOutput {
  slides: CardNewsSlide[]
  category: ContentCategory
  tags: string[]
  targetPersona: string
  topic: string
}

export interface GenerateV2Result {
  output: CardNewsOutput
  research: ResearchBrief
  sourcePostIds: string[]
}

// ─── v1 backward compat types ───

/** @deprecated v1 타입 — generateCardNewsV2() 사용 권장 */
type CardNewsType = 'NEWS_TREND' | 'INFO_TOPIC' | 'COMMUNITY_PROMO'

interface GenerateResult {
  cardNewsType: CardNewsType
  slides: Array<{
    type: 'cover' | 'content' | 'summary' | 'cta'
    title: string
    subtitle?: string
    body?: string
    bulletPoints?: string[]
    slideNumber: number
    totalSlides: number
    ctaText?: string
    postTitle?: string
    postAuthor?: string
    postSnippet?: string
  }>
  topic: string
  sourcePostIds: string[]
}

// ─── Day-of-Week Category Rotation (v2 — 6 categories) ───

function getCategoryForToday(): ContentCategory {
  const kstDay = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  ).getDay()

  switch (kstDay) {
    case 1: return 'WELLNESS'   // Mon
    case 2: return 'PRACTICAL'  // Tue
    case 3: return 'COMMUNITY'  // Wed
    case 4: return 'LIFESTYLE'  // Thu
    case 5: return 'GROWTH'     // Fri
    default: return 'TRENDING'  // Sat/Sun
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

// ─── Category Labels ───

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  WELLNESS: '건강/웰니스',
  PRACTICAL: '생활/실용',
  COMMUNITY: '커뮤니티/소통',
  LIFESTYLE: '라이프스타일',
  GROWTH: '성장/자기계발',
  TRENDING: '트렌드/이슈',
}

// ─── AI Content Generation (v2) ───

function buildSystemPrompt(category: ContentCategory): string {
  return `당신은 "우리 나이가 어때서" 커뮤니티(age-doesnt-matter.com)의 카드뉴스 콘텐츠 생성기입니다.

대상: 50대, 60대 (절대 "시니어" 용어 사용 금지. "우리 또래", "50대 60대", "인생 2막" 등 자연스러운 표현 사용)
톤: 따뜻하고 친근하며, 존댓말 사용, 쉬운 표현
오늘의 카테고리: ${category} (${CATEGORY_LABELS[category]})

슬라이드 타입 풀 (11종):
- hook: 눈길을 끄는 첫 슬라이드 (강렬한 질문/사실)
- context: 배경 설명, 왜 이 주제가 중요한지
- stat: 통계/숫자 강조 (statNumber, statLabel 필수)
- story: 사례/경험담
- tip: 실용 팁 (icon 이모지 필수)
- comparison: 비교 (leftLabel/leftText, rightLabel/rightText 필수)
- quote: 전문가 인용 (attribution 필수)
- listicle: 순위/목록 항목 (listRank 필수)
- stepguide: 단계별 가이드 (stepNumber, stepTotal 필수)
- summary: 핵심 요약
- cta: 행동 유도 (ctaText 필수)

규칙:
1. 6-10장 슬라이드 구성
2. 첫 슬라이드는 반드시 "hook", 마지막은 반드시 "cta"
3. 중간 슬라이드는 콘텐츠에 맞게 자유 구성
4. imagePrompt: DALL-E 이미지가 필요한 슬라이드에만 포함 (보통 hook + 1-3장)
   - 사람 포함 시: "Korean person in their 50s-60s, warm and active lifestyle" 스타일 지정
5. tip 슬라이드에는 반드시 icon (이모지) 포함
6. tags: 관련 해시태그 6-8개 (# 포함)
7. targetPersona: P1(건강관심), P2(재테크), P3(취미여행), P4(소통활동), P5(자기계발) 중 택 1
8. title: 최대 25자, body: 최대 120자, bulletPoints: 각 35자 이내 / 최대 5개
9. ctaText: 최대 14자 (예: "함께 이야기해요", "지금 둘러보기")
10. 정치/종교/혐오 절대 금지
11. "시니어" 절대 금지

반드시 아래 JSON 형식으로만 응답:
{
  "topic": "주제 요약 (15자 이내)",
  "category": "${category}",
  "tags": ["#태그1", "#태그2", ...],
  "targetPersona": "P1",
  "slides": [
    {"slideType": "hook", "title": "...", "body": "...", "imagePrompt": "..."},
    {"slideType": "stat", "title": "...", "statNumber": "73%", "statLabel": "..."},
    {"slideType": "tip", "title": "...", "bulletPoints": ["...", "..."], "icon": "💡"},
    ...
    {"slideType": "cta", "title": "...", "body": "...", "ctaText": "함께 이야기해요", "ctaUrl": "https://age-doesnt-matter.com"}
  ]
}`
}

function buildUserMessage(
  category: ContentCategory,
  trendData: CafeTrendData | null,
  research: ResearchBrief,
  communityPosts: PopularPost[],
): string {
  const parts: string[] = []

  // Trend data
  if (trendData) {
    const topTopics = trendData.hotTopics
      .slice(0, 5)
      .map((t) => `- ${t.topic} (${t.count}건, 분위기: ${t.sentiment})`)
      .join('\n')
    const keywords = trendData.keywords
      .slice(0, 10)
      .map((k) => k.word)
      .join(', ')
    parts.push(`## 오늘의 트렌드\n${topTopics}\n\n인기 키워드: ${keywords}`)
  } else {
    parts.push('## 트렌드\n트렌드 데이터 없음 — 50-60대가 관심있는 보편적 주제로 생성')
  }

  // Research brief
  const statsSection = research.statistics.length > 0
    ? `### 통계 (출처 있는 실제 데이터)\n${research.statistics.map((s) => `- ${s.number}: ${s.label}`).join('\n')}`
    : '### 통계\n⚠️ 검증된 통계 없음 — stat 슬라이드 절대 사용 금지. story/tip/context 슬라이드로 대체.'

  parts.push(`## 리서치 결과
### 핵심 사실
${research.facts.map((f) => `- ${f}`).join('\n')}

${statsSection}

### 전문가 인용
${research.expertQuotes.map((q) => `- "${q.quote}" — ${q.source}`).join('\n')}

### 실용 팁
${research.actionableTips.map((t) => `- ${t}`).join('\n')}

### 요약
${research.summary}`)

  // Community posts (especially relevant for COMMUNITY category)
  if (communityPosts.length > 0) {
    const postLines = communityPosts.map(
      (p) =>
        `- "${p.title}" by ${p.author?.nickname ?? '익명'} (공감 ${p.likeCount})\n  내용: ${p.content.replace(/<[^>]*>/g, '').slice(0, 100)}`,
    )
    parts.push(`## 인기 커뮤니티 글\n${postLines.join('\n')}`)
  }

  parts.push(
    `\n위 데이터를 바탕으로 "${CATEGORY_LABELS[category]}" 카테고리 카드뉴스를 JSON으로 생성해주세요.`,
  )

  return parts.join('\n\n')
}

// ─── Validation ───

function validateCardNewsOutput(parsed: CardNewsOutput): void {
  const { slides } = parsed

  if (!Array.isArray(slides) || slides.length < 6 || slides.length > 10) {
    throw new Error(
      `슬라이드 수 오류: ${Array.isArray(slides) ? slides.length : 0}장 (6-10장 필요)`,
    )
  }

  if (slides[0].slideType !== 'hook') {
    throw new Error(`첫 슬라이드가 hook이 아님: ${slides[0].slideType}`)
  }

  if (slides[slides.length - 1].slideType !== 'cta') {
    throw new Error(`마지막 슬라이드가 cta가 아님: ${slides[slides.length - 1].slideType}`)
  }

  for (let i = 0; i < slides.length; i++) {
    if (!slides[i].title || slides[i].title.trim() === '') {
      throw new Error(`슬라이드 ${i + 1}의 title이 비어있음`)
    }
  }

  if (!parsed.tags || parsed.tags.length < 4) {
    throw new Error(`태그 부족: ${parsed.tags?.length ?? 0}개 (최소 4개)`)
  }
}

// ─── Main v2 Export ───

export async function generateCardNewsV2(
  categoryOverride?: ContentCategory,
): Promise<GenerateV2Result> {
  const category = categoryOverride ?? getCategoryForToday()
  console.log(`[CardNewsV2] 카테고리: ${category} (${CATEGORY_LABELS[category]})`)

  // 1. Fetch data
  const [trendData, communityPosts] = await Promise.all([
    getTodayTrend(),
    getPopularCommunityPosts(),
  ])

  console.log(
    `[CardNewsV2] 데이터: trend=${trendData ? 'OK' : 'N/A'}, posts=${communityPosts.length}개`,
  )

  // 2. Research
  const topicForResearch = trendData?.hotTopics[0]?.topic
    ?? trendData?.magazineTopics[0]?.title
    ?? CATEGORY_LABELS[category]

  console.log(`[CardNewsV2] 리서치 주제: "${topicForResearch}"`)
  const research = await researchTopic(topicForResearch, category)
  console.log(`[CardNewsV2] 리서치 완료: facts=${research.facts.length}, stats=${research.statistics.length}`)

  // 3. AI generation
  const systemPrompt = buildSystemPrompt(category)
  const userMessage = buildUserMessage(category, trendData, research, communityPosts)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  let parsed: CardNewsOutput
  try {
    parsed = JSON.parse(jsonStr) as CardNewsOutput
  } catch (err) {
    console.error('[CardNewsV2] AI JSON 파싱 실패:', jsonStr.slice(0, 500))
    throw new Error(
      `AI 콘텐츠 JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 4. Auto-trim: 슬라이드 초과 시 10장으로 자동 조정 (hook + 중간 8장 + cta)
  if (Array.isArray(parsed.slides) && parsed.slides.length > 10) {
    console.log(`[CardNewsV2] 슬라이드 ${parsed.slides.length}장 → 10장으로 자동 트림`)
    const hook = parsed.slides[0]
    const cta = parsed.slides[parsed.slides.length - 1]
    const middle = parsed.slides.slice(1, -1).slice(0, 8)
    parsed.slides = [hook, ...middle, cta]
  }

  // 5. Validate
  validateCardNewsOutput(parsed)
  console.log(
    `[CardNewsV2] 콘텐츠 생성 완료: "${parsed.topic}" (${parsed.slides.length}장, ${parsed.tags.length} tags)`,
  )

  // 5. Collect source post IDs
  const sourcePostIds =
    category === 'COMMUNITY' ? communityPosts.map((p) => p.id) : []

  return {
    output: parsed,
    research,
    sourcePostIds,
  }
}

// ─── Deprecated v1 Export ───

/**
 * @deprecated v1 함수 — generateCardNewsV2() 사용 권장
 * 하위 호환을 위해 유지. v1 renderer와 함께 사용.
 */
export async function generateCardNewsContent(): Promise<GenerateResult> {
  const kstDay = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  ).getDay()

  let cardNewsType: CardNewsType
  switch (kstDay) {
    case 1: case 3: case 5:
      cardNewsType = 'NEWS_TREND'; break
    case 2: case 4:
      cardNewsType = 'INFO_TOPIC'; break
    default:
      cardNewsType = 'COMMUNITY_PROMO'
  }

  const [trendData, communityPosts] = await Promise.all([
    getTodayTrend(),
    getPopularCommunityPosts(),
  ])

  const topicsContext = trendData
    ? `오늘의 트렌드:\n${trendData.hotTopics.slice(0, 5).map((t) => `- ${t.topic} (${t.count}건, 분위기: ${t.sentiment})`).join('\n')}\n\n인기 키워드: ${trendData.keywords.slice(0, 10).map((k) => k.word).join(', ')}`
    : '트렌드 데이터 없음 — 50-60대가 관심있는 보편적 주제로 생성'

  const communityContext =
    communityPosts.length > 0
      ? `\n\n인기 커뮤니티 글:\n${communityPosts.map((p) => `- "${p.title}" by ${p.author?.nickname ?? '익명'} (공감 ${p.likeCount})\n  내용: ${p.content.replace(/<[^>]*>/g, '').slice(0, 100)}`).join('\n')}`
      : ''

  const lightModel = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

  const response = await client.messages.create({
    model: lightModel,
    max_tokens: 1500,
    system: `당신은 "우리 나이가 어때서" 커뮤니티의 카드뉴스 콘텐츠 생성기입니다.
대상: 50대, 60대 (절대 "시니어" 용어 사용 금지)
톤: 따뜻하고 친근하며, 존댓말 사용, 쉬운 표현
카드뉴스 구성 (5장): cover → content → content → summary → cta
반드시 JSON으로만 응답:
{"topic":"...", "slides":[{"type":"cover","title":"...","subtitle":"..."},{"type":"content","title":"...","body":"...","bulletPoints":["..."]},{"type":"content","title":"...","body":"...","bulletPoints":["..."]},{"type":"summary","title":"...","bulletPoints":["...","...","..."]},{"type":"cta","title":"...","subtitle":"...","ctaText":"..."}]}`,
    messages: [{ role: 'user', content: `${topicsContext}${communityContext}\n\n위 데이터를 바탕으로 카드뉴스 5장을 JSON으로 생성해주세요.` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const aiContent = JSON.parse(jsonStr) as { topic: string; slides: Array<{ type: 'cover' | 'content' | 'summary' | 'cta'; title: string; subtitle?: string; body?: string; bulletPoints?: string[]; ctaText?: string; postTitle?: string; postAuthor?: string; postSnippet?: string }> }

  const totalSlides = aiContent.slides.length
  const slides = aiContent.slides.map((s, i) => ({
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

  const sourcePostIds =
    cardNewsType === 'COMMUNITY_PROMO' ? communityPosts.map((p) => p.id) : []

  return { cardNewsType, slides, topic: aiContent.topic, sourcePostIds }
}

// ─── Main Runner ───

async function main() {
  console.log('[CardNews v2] 파이프라인 시작')
  const startTime = Date.now()

  // 1. Generate v2 content
  const { output, research, sourcePostIds } = await generateCardNewsV2()
  console.log(`[CardNews v2] 콘텐츠 생성 완료: "${output.topic}" (${output.slides.length}장)`)

  // 2. Build slide data for renderer
  const slideDataList: CardNewsSlideData[] = output.slides.map((s, i) => ({
    slideType: s.slideType,
    title: s.title,
    body: s.body,
    bulletPoints: s.bulletPoints,
    statNumber: s.statNumber,
    statLabel: s.statLabel,
    stepNumber: s.stepNumber,
    stepTotal: s.stepTotal,
    listRank: s.listRank,
    ctaText: s.ctaText,
    ctaUrl: s.ctaUrl ?? 'https://age-doesnt-matter.com',
    icon: s.icon,
    leftLabel: s.leftLabel,
    leftText: s.leftText,
    rightLabel: s.rightLabel,
    rightText: s.rightText,
    attribution: s.attribution,
    slideNumber: i + 1,
    totalSlides: output.slides.length,
    category: output.category,
  }))

  // 3. Render images
  let renderResult: RenderResult
  try {
    renderResult = await renderCardNewsV2(slideDataList)
    console.log(`[CardNews v2] 이미지 렌더링 완료: ${renderResult.imageUrls.length}장`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[CardNews v2] 렌더링 실패:', message)
    await notifySlack({
      level: 'important',
      agent: 'CMO',
      title: '카드뉴스 v2 렌더링 실패',
      body: `주제: ${output.topic}\n카테고리: ${output.category}\n오류: ${message}`,
    })
    await disconnect()
    process.exit(1)
  }

  // 4. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CARD_NEWS_V2_GENERATE',
      status: 'SUCCESS',
      details: JSON.stringify({
        category: output.category,
        topic: output.topic,
        slideCount: output.slides.length,
        slideTypes: output.slides.map((s) => s.slideType),
        tags: output.tags,
        targetPersona: output.targetPersona,
        imageUrls: renderResult.imageUrls,
        thumbnailUrl: renderResult.thumbnailUrl,
        sourcePostIds,
        researchStats: {
          facts: research.facts.length,
          statistics: research.statistics.length,
          quotes: research.expertQuotes.length,
          tips: research.actionableTips.length,
        },
      }),
      itemCount: output.slides.length,
      executionTimeMs: durationMs,
    },
  })

  // 5. Slack notification
  const categoryLabel = CATEGORY_LABELS[output.category]

  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: `카드뉴스 v2 생성 완료 — ${categoryLabel}`,
    body: [
      `*주제*: ${output.topic}`,
      `*카테고리*: ${categoryLabel} (${output.category})`,
      `*슬라이드*: ${renderResult.imageUrls.length}장 (${output.slides.map((s) => s.slideType).join(' → ')})`,
      `*태그*: ${output.tags.join(' ')}`,
      `*페르소나*: ${output.targetPersona}`,
      `*썸네일*: ${renderResult.thumbnailUrl}`,
      `*이미지 URLs*:\n${renderResult.imageUrls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}`,
      sourcePostIds.length > 0 ? `*참조 게시글*: ${sourcePostIds.length}건` : '',
      `*리서치*: facts=${research.facts.length}, stats=${research.statistics.length}, quotes=${research.expertQuotes.length}`,
      `*소요*: ${Math.round(durationMs / 1000)}초`,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  console.log(
    `[CardNews v2] 파이프라인 완료 — ${categoryLabel} "${output.topic}", ${renderResult.imageUrls.length}장, ${Math.round(durationMs / 1000)}초`,
  )

  await disconnect()
}

main().catch(async (err) => {
  console.error('[CardNews v2] 파이프라인 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '카드뉴스 v2 파이프라인 실패',
    body: err instanceof Error ? err.message : String(err),
  }).catch(() => {})
  await disconnect().catch(() => {})
  process.exit(1)
})
