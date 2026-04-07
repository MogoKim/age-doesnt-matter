/**
 * 카드뉴스 v2 리서처 — Perplexity 웹검색 + Claude Sonnet 구조화
 * CafeTrend 토픽을 받아 ResearchBrief를 생성
 */

import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchBrief {
  facts: string[]                                        // 3-5 key facts
  statistics: Array<{ number: string; label: string }>   // 2-3 stats with numbers
  expertQuotes: Array<{ quote: string; source: string }> // 1-2 expert quotes
  actionableTips: string[]                               // 3-4 actionable tips
  sources: string[]                                      // source URLs
  summary: string                                        // 2-3 sentence summary
}

type TopicCategory =
  | 'WELLNESS'
  | 'PRACTICAL'
  | 'COMMUNITY'
  | 'LIFESTYLE'
  | 'GROWTH'
  | 'TRENDING'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'

const CATEGORY_FOCUS: Record<TopicCategory, string> = {
  WELLNESS: '건강 운동 정신건강 웰빙 식단 수면 관리',
  PRACTICAL: '재테크 디지털 법률 연금 세금 부동산',
  COMMUNITY: '소통 커뮤니티 모임 봉사 동호회 네트워킹',
  LIFESTYLE: '여행 음식 취미 문화 공연 맛집 가드닝',
  GROWTH: '배움 자격증 제2의커리어 온라인강의 창업 재취업',
  TRENDING: '최신 트렌드 이슈 사회 경제 기술',
}

// ---------------------------------------------------------------------------
// Perplexity web search
// ---------------------------------------------------------------------------

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface PerplexityResponse {
  choices: Array<{
    message: { content: string }
  }>
}

async function searchWithPerplexity(
  topic: string,
  category: TopicCategory,
): Promise<string | null> {
  if (!PERPLEXITY_API_KEY) {
    console.log('[CardNewsResearcher] PERPLEXITY_API_KEY 없음 — Claude-only 모드')
    return null
  }

  const focus = CATEGORY_FOCUS[category] ?? CATEGORY_FOCUS.TRENDING

  const messages: PerplexityMessage[] = [
    {
      role: 'system',
      content:
        '당신은 50대 60대 한국인을 위한 콘텐츠를 조사하는 전문 리서처입니다. '
        + '최신 한국어 자료를 우선으로 검색하고, 신뢰할 수 있는 통계와 전문가 의견을 포함해 주세요. '
        + '출처 URL을 반드시 함께 제공하세요.',
    },
    {
      role: 'user',
      content:
        `50대 60대를 위한 "${topic}" 관련 최신 정보를 조사해 주세요.\n\n`
        + `초점 키워드: ${focus}\n\n`
        + '다음을 포함해 주세요:\n'
        + '1. 핵심 사실 3-5개\n'
        + '2. 구체적인 통계 수치 2-3개\n'
        + '3. 전문가 인용 1-2개\n'
        + '4. 실천 가능한 팁 3-4개\n'
        + '5. 출처 URL 목록',
    },
  ]

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      console.error(
        '[CardNewsResearcher] Perplexity API 에러:',
        response.status,
        await response.text(),
      )
      return null
    }

    const data = (await response.json()) as PerplexityResponse
    const content = data.choices?.[0]?.message?.content ?? null

    if (content) {
      console.log('[CardNewsResearcher] Perplexity 검색 완료')
    }

    return content
  } catch (err) {
    console.error('[CardNewsResearcher] Perplexity 검색 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Claude synthesis
// ---------------------------------------------------------------------------

async function synthesizeWithClaude(
  topic: string,
  category: string,
  perplexityResult: string | null,
): Promise<ResearchBrief> {
  const anthropic = new Anthropic()

  const contextBlock = perplexityResult
    ? `\n\n## 웹 검색 결과\n${perplexityResult}`
    : ''

  // Perplexity 없을 때 통계 생성 금지 — 출처 불명 수치 hallucination 방지
  const statisticsInstruction = perplexityResult
    ? '  "statistics": [{"number": "수치", "label": "설명(출처 포함)", "source": "출처명"}, ...],  // 2-3개 (반드시 웹 검색 결과에서 추출, 창작 금지)\n'
    : '  "statistics": [],  // Perplexity 검색 결과 없음 — 빈 배열 유지 (AI 창작 수치 절대 금지)\n'

  const userPrompt =
    `주제: "${topic}" (카테고리: ${category})\n`
    + `${contextBlock}\n\n`
    + '위 정보를 바탕으로 50대 60대 한국인 대상 카드뉴스 리서치 브리프를 작성해 주세요.\n'
    + '"시니어"라는 단어는 절대 사용하지 마세요. "우리 또래", "50대 60대", "인생 2막" 등 자연스러운 표현을 사용하세요.\n\n'
    + '반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON):\n'
    + '{\n'
    + '  "facts": ["사실1", "사실2", ...],           // 3-5개\n'
    + statisticsInstruction
    + '  "expertQuotes": [{"quote": "인용문", "source": "출처"}, ...],  // 1-2개\n'
    + '  "actionableTips": ["팁1", "팁2", ...],      // 3-4개\n'
    + '  "sources": ["URL1", "URL2", ...],\n'
    + '  "summary": "2-3문장 요약"\n'
    + '}'

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system:
      '당신은 50대 60대 한국인을 위한 콘텐츠 리서치 전문가입니다. '
      + '정확한 사실과 통계를 제공하며, 실용적이고 따뜻한 톤으로 작성합니다. '
      + '"시니어"라는 단어는 절대 사용하지 않습니다. '
      + '반드시 유효한 JSON만 응답하세요.',
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('[CardNewsResearcher] Claude 응답에 텍스트 블록 없음')
  }

  const rawText = textBlock.text.trim()

  // Strip markdown code fences if present
  const jsonStr = rawText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')

  const parsed: unknown = JSON.parse(jsonStr)
  const brief = parsed as ResearchBrief

  // Validate required fields with defaults
  return {
    facts: Array.isArray(brief.facts) ? brief.facts : [],
    statistics: Array.isArray(brief.statistics) ? brief.statistics : [],
    expertQuotes: Array.isArray(brief.expertQuotes) ? brief.expertQuotes : [],
    actionableTips: Array.isArray(brief.actionableTips) ? brief.actionableTips : [],
    sources: Array.isArray(brief.sources) ? brief.sources : [],
    summary: typeof brief.summary === 'string' ? brief.summary : '',
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 주어진 토픽에 대해 Perplexity 웹검색 + Claude 구조화를 수행하여
 * 카드뉴스용 ResearchBrief를 반환합니다.
 *
 * - PERPLEXITY_API_KEY가 없으면 Claude-only 모드로 동작
 * - 카테고리에 따라 검색 초점이 달라짐
 */
export async function researchTopic(
  topic: string,
  category: string,
): Promise<ResearchBrief> {
  const normalizedCategory = (
    Object.keys(CATEGORY_FOCUS).includes(category.toUpperCase())
      ? category.toUpperCase()
      : 'TRENDING'
  ) as TopicCategory

  // Step 1: Perplexity 웹검색 (API 키 없으면 null)
  const perplexityResult = await searchWithPerplexity(topic, normalizedCategory)

  // Step 2: Claude Sonnet으로 구조화
  const brief = await synthesizeWithClaude(topic, category, perplexityResult)

  console.log('[CardNewsResearcher] ResearchBrief 생성 완료')
  return brief
}
