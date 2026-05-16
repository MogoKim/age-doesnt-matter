/**
 * 매거진 콘텐츠 → 네이버 블로그 포맷 변환
 * Claude Sonnet으로 HTML 원본을 5060 감성 블로그 글로 재작성
 *
 * 입력: Prisma Post (boardType=MAGAZINE)
 * 출력: BlogContent (blogTitle, sections, hashtags, geoKeyword)
 *
 * 비용: ~$0.005/글 (입력 1500 + 출력 800 토큰 × claude-sonnet-4-6 요금)
 */

import Anthropic from '@anthropic-ai/sdk'
import { CONTENT_POLICY } from './config.js'

// ── 타입 ──

export interface PostInput {
  id: string
  title: string
  content: string          // HTML
  summary: string | null
  seoDescription: string | null
  thumbnailUrl: string | null
  category: string | null
}

export interface BlogSection {
  heading: string | null   // 소제목 (이모지 포함) — null이면 단순 단락
  body: string             // 2-3문장 단락
  isQuote: boolean         // Phase 2: 인용구 블록 (현재는 항상 false)
}

export interface BlogContent {
  blogTitle: string         // 35-40자, 키워드 앞배치 + 숫자 포함
  sections: BlogSection[]   // 소제목+본문 배열
  hashtags: string[]        // 5-10개, "#50대라이프" 형식
  geoKeyword: string | null // 지역 키워드 (여행/문화/음식 카테고리)
  imagePrompts: string[]    // DALL-E 3 프롬프트 3개 — 글 내용 기반 LLM 생성
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  charCount: number
}

// ── 내부 상수 ──

const MAX_RETRIES = 2
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const GEO_CATEGORIES = ['여행', '문화', '음식', '카페', '맛집', '관광']

// ── HTML → plain text ──

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── 시스템 프롬프트 ──

function buildSystemPrompt(): string {
  const forbidden = CONTENT_POLICY.forbiddenWords.join(', ')
  return `당신은 5060 세련된 중년 여성들을 위한 감각적인 네이버 블로그 작가입니다.
네이버 AI 브리핑(2025년 3월 출시) 인용 최적화와 C-Rank·D.I.A.+ SEO를 동시에 충족해야 합니다.

[절대 금지 단어] ${forbidden} — 포함 즉시 재작성
[대체 표현] "우리 또래", "50대", "60대", "인생 2막", "우리 세대", "중장년"

━━ 제목 ━━
- 35~40자, 핵심 키워드 앞부분 배치, 숫자 포함
- 예: "50대 여성 무릎 통증, 집에서 5분 스트레칭으로 해소하는 방법 3가지"

━━ 첫 단락 (AI 브리핑 인용 최적화) ━━
- heading: null, 서론 없이 검색 쿼리 답변을 2~3문장으로 즉시 제시
- "2025년 기준", "실제 경험" 등 신뢰 신호 포함
- 네이버 AI 브리핑이 첫 200자를 우선 인용함

━━ 소제목 ━━
- 질문형으로 작성: "~란?", "~방법은?", "~주의할 점은?", "~효과는?"
- 이모지 1개 + 질문형 키워드 (예: "🌿 갱년기 증상, 어떻게 다스릴까?")

━━ 본문 구조 ━━
- 각 섹션 body: 3~4문장, 한 문장 40~80자
- 번호 목록 또는 단계별 설명 1개 이상 포함 (체류시간 확보)
- 수치·날짜·실제 경험 반드시 포함

━━ 마무리 단락 ━━
- heading: null, 핵심 내용 3줄 요약 → AI 재인용 유도

━━ 길이 ━━
- 전체 body 합산 1,500~2,000자 목표 (최소 1,500자)

━━ 해시태그 ━━
- 5~10개, "#" 포함, 검색 가능한 구체적 키워드
- 예: #50대라이프 #중년여성 #인생2막 #건강관리 #갱년기극복

━━ imagePrompts ━━
- DALL-E 3용 영문 프롬프트 3개
- 공통 조건: Korean setting, Korean woman in her mid-40s, natural lifestyle photo, warm and authentic atmosphere
- 구체적 장소·소품·상황은 반드시 본문 내용에서만 도출 (임의 추가 금지)
- 각 프롬프트는 서로 다른 장면/구도로 구성

[JSON 출력 형식 — 반드시 이 형식만 출력]
{
  "blogTitle": "...",
  "sections": [
    { "heading": null, "body": "AI 브리핑용 즉시 답변 단락", "isQuote": false },
    { "heading": "🌿 질문형 소제목?", "body": "3~4문장 본문", "isQuote": false },
    { "heading": null, "body": "핵심 3줄 요약 마무리", "isQuote": false }
  ],
  "hashtags": ["#50대라이프", "#건강관리"],
  "geoKeyword": null,
  "imagePrompts": [
    "A Korean woman in her mid-40s ... (scene 1)",
    "A Korean woman in her mid-40s ... (scene 2)",
    "A Korean woman in her mid-40s ... (scene 3)"
  ]
}

JSON 외 다른 텍스트 절대 출력 금지. 마크다운 코드블록(\`\`\`) 감싸기 금지.`
}

// ── 유저 프롬프트 ──

function buildUserPrompt(post: PostInput): string {
  const plainText = stripHtml(post.content)
  const excerpt = plainText.slice(0, 1800)
  const summary = post.summary ?? post.seoDescription ?? ''
  const category = post.category ?? '라이프'
  const needsGeo = GEO_CATEGORIES.some(g => category.includes(g))

  return `다음 매거진 기사를 네이버 블로그 글로 재작성해주세요.

[원본 제목] ${post.title}
[카테고리] ${category}
[요약] ${summary}
[본문 발췌]
${excerpt}

[요청사항]
1. blogTitle: 35~40자, 핵심 키워드 앞배치 + 숫자 포함
2. sections: 첫 단락(AI 브리핑용 즉시 답변) → 질문형 소제목 단락 3~4개 → 마무리 요약 단락
3. hashtags: 이 글의 주제에 맞는 검색 키워드 5~10개${needsGeo ? '\n4. geoKeyword: 본문에서 언급된 구체적 지역명 추출 (없으면 null)' : '\n4. geoKeyword: null'}
5. imagePrompts: 이 글의 실제 내용과 분위기에서 도출한 DALL-E 3 영문 프롬프트 3개 (서로 다른 장면)

절대 금지: ${CONTENT_POLICY.forbiddenWords.join(', ')}`
}

// ── 유효성 검사 ──

export function validateBlogContent(content: BlogContent): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const allText = [
    content.blogTitle,
    ...content.sections.map(s => `${s.heading ?? ''} ${s.body}`),
  ].join(' ')

  const charCount = content.sections.map(s => s.body).join('').length

  // 금지어 체크
  for (const word of CONTENT_POLICY.forbiddenWords) {
    if (allText.includes(word)) {
      errors.push(`금지어 포함: "${word}"`)
    }
  }

  // 길이 체크
  if (charCount < CONTENT_POLICY.minChars) {
    errors.push(`본문 너무 짧음: ${charCount}자 (최소 ${CONTENT_POLICY.minChars}자)`)
  }
  if (charCount > CONTENT_POLICY.maxChars) {
    warnings.push(`본문 너무 김: ${charCount}자 (최대 ${CONTENT_POLICY.maxChars}자)`)
  }

  // 해시태그 체크
  if (content.hashtags.length < CONTENT_POLICY.minHashtags) {
    warnings.push(`해시태그 부족: ${content.hashtags.length}개 (최소 ${CONTENT_POLICY.minHashtags}개)`)
  }
  if (content.hashtags.length > CONTENT_POLICY.maxHashtags) {
    warnings.push(`해시태그 초과: ${content.hashtags.length}개 (최대 ${CONTENT_POLICY.maxHashtags}개)`)
  }

  // 제목 체크
  if (!content.blogTitle || content.blogTitle.trim().length < 5) {
    errors.push('블로그 제목이 비어 있거나 너무 짧음')
  }

  // sections 체크
  if (!content.sections || content.sections.length === 0) {
    errors.push('섹션이 없음')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    charCount,
  }
}

// ── Tool Use 스키마 (JSON 파싱 실패 원천 차단) ──

const BLOG_CONTENT_TOOL: Anthropic.Tool = {
  name: 'blog_content',
  description: '네이버 블로그 콘텐츠 구조체 반환',
  input_schema: {
    type: 'object' as const,
    properties: {
      blogTitle: { type: 'string', description: '35~40자 블로그 제목' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: ['string', 'null'], description: '소제목 (이모지+질문형) 또는 null' },
            body: { type: 'string', description: '3~4문장 본문' },
            isQuote: { type: 'boolean' },
          },
          required: ['heading', 'body', 'isQuote'],
        },
      },
      hashtags: { type: 'array', items: { type: 'string' }, description: '#포함 5~10개' },
      geoKeyword: { type: ['string', 'null'], description: '지역 키워드 또는 null' },
      imagePrompts: { type: 'array', items: { type: 'string' }, description: 'DALL-E 3 영문 프롬프트 3개' },
    },
    required: ['blogTitle', 'sections', 'hashtags', 'geoKeyword', 'imagePrompts'],
  },
}

function normalizeContent(raw: BlogContent): BlogContent {
  return {
    ...raw,
    hashtags: (raw.hashtags ?? []).map(t => t.startsWith('#') ? t : `#${t}`),
    sections: (raw.sections ?? []).map(s => ({ ...s, isQuote: s.isQuote ?? false })),
    imagePrompts: raw.imagePrompts ?? [],
  }
}

// ── 메인 변환 함수 ──

export async function transformTooBlogContent(post: PostInput): Promise<BlogContent> {
  const client = new Anthropic()
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(post)

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    console.log(`[ContentTransformer] LLM 재작성 시도 ${attempt}/${MAX_RETRIES + 1}: "${post.title}"`)

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 5000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [BLOG_CONTENT_TOOL],
        tool_choice: { type: 'tool', name: 'blog_content' },
      })

      const toolBlock = response.content.find(b => b.type === 'tool_use')
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        throw new Error('tool_use 블록 없음 — 예상치 못한 응답 구조')
      }

      const blogContent = normalizeContent(toolBlock.input as BlogContent)
      const validation = validateBlogContent(blogContent)

      if (!validation.valid) {
        const errorMsg = validation.errors.join(' | ')
        console.warn(`[ContentTransformer] 검증 실패 (시도 ${attempt}): ${errorMsg}`)
        if (attempt <= MAX_RETRIES) {
          lastError = new Error(`검증 실패: ${errorMsg}`)
          continue
        }
        throw new Error(`콘텐츠 검증 최종 실패: ${errorMsg}`)
      }

      if (validation.warnings.length > 0) {
        console.warn(`[ContentTransformer] 경고: ${validation.warnings.join(' | ')}`)
      }

      console.log(`[ContentTransformer] ✅ 변환 성공 — ${validation.charCount}자, 해시태그 ${blogContent.hashtags.length}개`)
      return blogContent
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[ContentTransformer] 시도 ${attempt} 오류:`, lastError.message)
      if (attempt <= MAX_RETRIES) continue
    }
  }

  throw lastError ?? new Error('[ContentTransformer] 알 수 없는 오류')
}
