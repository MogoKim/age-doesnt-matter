import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CMO 에이전트 — 트렌드 분석
 * 매일 10:00: 검색어 갭 분석 + 콘텐츠 주제 제안
 */
class CMOTrendAnalyzer extends BaseAgent {
  constructor() {
    super({
      name: 'CMO',
      role: 'CMO (마케팅총괄)',
      model: 'heavy',
      tasks: '트렌드 분석, 검색어 갭 분석, SEO 점검, 유입 분석',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 1. 인기 검색어 (search 이벤트 집계)
    const searchEvents = await prisma.eventLog.findMany({
      where: {
        eventName: 'search',
        createdAt: { gte: sevenDaysAgo },
      },
      select: { properties: true },
      take: 500,
    })

    const searchTerms = new Map<string, number>()
    for (const event of searchEvents) {
      const props = event.properties as Record<string, unknown>
      const query = (props?.query as string)?.toLowerCase()?.trim()
      if (query && query.length >= 2) {
        searchTerms.set(query, (searchTerms.get(query) ?? 0) + 1)
      }
    }

    const topSearches = Array.from(searchTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)

    // 2. 인기 게시글 (지난 7일)
    const hotPosts = await prisma.post.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, status: 'PUBLISHED' },
      orderBy: { viewCount: 'desc' },
      take: 10,
      select: { title: true, boardType: true, viewCount: true, likeCount: true },
    })

    // 3. AI 분석
    const analysis = await this.chat(`
아래 데이터를 분석하고 콘텐츠 전략을 제안하세요.

[인기 검색어 TOP 20]
${topSearches.map(([term, count]) => `- "${term}" (${count}회)`).join('\n') || '(데이터 없음)'}

[인기 게시글 TOP 10]
${hotPosts.map((p) => `- [${p.boardType}] ${p.title} (조회 ${p.viewCount}, 공감 ${p.likeCount})`).join('\n') || '(데이터 없음)'}

응답 형식 (JSON):
{
  "trend_summary": "트렌드 요약 (2-3문장)",
  "content_suggestions": ["매거진/사는이야기 주제 제안 3-5개"],
  "seo_keywords": ["SEO 공략 키워드 5개"]
}
`)

    let parsed: { trend_summary: string; content_suggestions: string[]; seo_keywords: string[] }
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { trend_summary: analysis.slice(0, 200), content_suggestions: [], seo_keywords: [] }
    } catch {
      parsed = { trend_summary: analysis.slice(0, 200), content_suggestions: [], seo_keywords: [] }
    }

    await notifyAdmin({
      level: 'info',
      agent: 'CMO',
      title: '일일 트렌드 분석 완료',
      body: `${parsed.trend_summary}\n\n주제 제안: ${parsed.content_suggestions.join(', ')}`,
    })

    return {
      agent: 'CMO',
      success: true,
      summary: parsed.trend_summary,
      data: { topSearches: topSearches.slice(0, 10), suggestions: parsed.content_suggestions, keywords: parsed.seo_keywords },
    }
  }
}

const agent = new CMOTrendAnalyzer()
agent.execute().then((result) => {
  console.log('[CMO] 트렌드 분석:', result.summary)
  process.exit(0)
})
