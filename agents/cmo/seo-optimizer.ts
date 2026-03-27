/**
 * CMO SEO Optimizer — 주간 SEO 모니터링 에이전트
 *
 * 매주 월요일 실행:
 * 1. CafeTrend 핫 키워드 → SEO 키워드 추천
 * 2. 최근 매거진/글의 메타데이터 커버리지 체크
 * 3. Slack 리포트
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

/** 최근 트렌드 키워드 수집 */
async function getRecentKeywords(): Promise<string[]> {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const trends = await prisma.cafeTrend.findMany({
    where: { date: { gte: weekAgo } },
    orderBy: { date: 'desc' },
    take: 7,
    select: { keywords: true, hotTopics: true },
  })

  const allKeywords: string[] = []
  for (const t of trends) {
    const kws = t.keywords as Array<{ word: string; frequency: number }> | null
    if (kws) {
      allKeywords.push(...kws.map(k => k.word))
    }
    const topics = t.hotTopics as Array<{ topic: string }> | null
    if (topics) {
      allKeywords.push(...topics.map(tp => tp.topic))
    }
  }

  // 빈도 카운트 후 상위 20개
  const freq = new Map<string, number>()
  for (const kw of allKeywords) {
    freq.set(kw, (freq.get(kw) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word)
}

/** 메타데이터 커버리지 체크 */
async function checkMetaCoverage() {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  // 최근 1주 게시된 글 중 summary 없는 것
  const missingSummary = await prisma.post.count({
    where: {
      createdAt: { gte: weekAgo },
      status: 'PUBLISHED',
      OR: [
        { summary: null },
        { summary: '' },
      ],
    },
  })

  // 최근 매거진 중 thumbnail 없는 것
  const missingThumbnail = await prisma.post.count({
    where: {
      createdAt: { gte: weekAgo },
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      thumbnailUrl: null,
    },
  })

  // 전체 콘텐츠 수
  const totalRecent = await prisma.post.count({
    where: {
      createdAt: { gte: weekAgo },
      status: 'PUBLISHED',
    },
  })

  return { totalRecent, missingSummary, missingThumbnail }
}

/** AI로 SEO 키워드 추천 생성 */
async function generateSeoRecommendations(keywords: string[]): Promise<string> {
  if (keywords.length === 0) return '트렌드 데이터 부족 — 키워드 추천 불가'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `당신은 한국 50-60대 대상 커뮤니티 "우리 나이가 어때서"의 SEO 전문가입니다.
카페 트렌드 키워드를 분석해서 매거진/콘텐츠에 활용할 SEO 키워드를 추천해주세요.
응답은 간결한 한국어 불릿 포인트로.`,
    messages: [{
      role: 'user',
      content: `이번 주 인기 키워드: ${keywords.join(', ')}

다음을 분석해주세요:
1. 검색 유입에 효과적인 롱테일 키워드 5개
2. 매거진 제목으로 쓸 만한 주제 3개
3. 메타 디스크립션에 포함할 핵심 키워드 조합`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

/** 메인 실행 */
async function main() {
  console.log('[SEOOptimizer] 시작 — 주간 SEO 모니터링')
  const startTime = Date.now()

  // 1. 트렌드 키워드 수집
  const keywords = await getRecentKeywords()
  console.log(`[SEOOptimizer] 트렌드 키워드 ${keywords.length}개 수집`)

  // 2. 메타 커버리지 체크
  const coverage = await checkMetaCoverage()
  console.log(`[SEOOptimizer] 메타 커버리지: 총 ${coverage.totalRecent}건, summary 누락 ${coverage.missingSummary}건, 썸네일 누락 ${coverage.missingThumbnail}건`)

  // 3. AI SEO 추천
  const recommendations = await generateSeoRecommendations(keywords)

  const durationMs = Date.now() - startTime

  // 4. Slack 리포트
  const report = [
    '📊 *주간 SEO 리포트*',
    '',
    `*트렌드 키워드 Top 10:* ${keywords.slice(0, 10).join(', ')}`,
    '',
    '*메타데이터 커버리지 (최근 7일):*',
    `  - 전체 게시물: ${coverage.totalRecent}건`,
    `  - summary 누락: ${coverage.missingSummary}건`,
    `  - 썸네일 누락 (매거진): ${coverage.missingThumbnail}건`,
    '',
    '*AI SEO 추천:*',
    recommendations,
  ].join('\n')

  await notifySlack({
    level: 'info',
    agent: 'SEO_OPTIMIZER',
    title: '주간 SEO 모니터링 리포트',
    body: report,
  })

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'SEO_MONITOR',
      status: 'SUCCESS',
      details: JSON.stringify({
        topKeywords: keywords.slice(0, 10),
        coverage,
        recommendations: recommendations.slice(0, 500),
      }),
      itemCount: keywords.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[SEOOptimizer] 완료 — ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SEOOptimizer] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
