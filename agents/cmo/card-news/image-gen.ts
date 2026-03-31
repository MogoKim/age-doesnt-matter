/**
 * 카드뉴스 v2 이미지 생성기 — DALL-E 3 + R2 업로드
 * 슬라이드별 프롬프트를 받아 병렬로 이미지 생성 후 R2에 업로드
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardNewsImageResult {
  url: string          // R2 uploaded URL
  prompt: string       // used prompt
  slideIndex: number   // which slide this is for
}

export type ImageStyle =
  | 'warm-lifestyle'
  | 'clean-infographic'
  | 'cozy-community'
  | 'active-growth'

interface ImagePromptInput {
  slideIndex: number
  prompt: string
  style: ImageStyle
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const PERSON_STYLE_GUIDE = {
  femalePrompt:
    'elegant Korean woman in her early 50s, well-groomed, healthy and vibrant, '
    + 'natural dark hair with subtle highlights, confident smile, '
    + 'stylish casual outfit, warm natural lighting, '
    + 'similar vibe to a refined Korean actress in her 50s',

  malePrompt:
    'charismatic Korean man in his early 50s, well-maintained appearance, '
    + 'natural dark hair, warm genuine smile, '
    + 'smart casual style, confident posture, '
    + 'similar vibe to a distinguished Korean actor in his 50s',

  never: [
    'white hair', 'gray hair', 'wrinkled', 'elderly', 'senior citizen',
    'old person', 'frail', 'walking stick', 'cane', 'Western', 'Caucasian',
  ] as const,
}

const STYLE_PREFIXES: Record<ImageStyle, string> = {
  'warm-lifestyle': '따뜻하고 밝은 톤의 일러스트레이션, 한국적 감성, 잡지 품질,',
  'clean-infographic': '깔끔하고 신뢰감 있는 인포그래픽 스타일, 미니멀,',
  'cozy-community': '포근하고 따뜻한 커뮤니티 분위기, 함께하는 장면,',
  'active-growth': '활기차고 에너지 넘치는, 도전과 성장의 분위기,',
}

const PERSON_KEYWORDS = ['사람', '여성', '남성', '얼굴', '인물', '남자', '여자', '부부', '커플']

const NO_TEXT_DIRECTIVE = 'No text, no letters, no words, no numbers in the image.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DalleResponse {
  data: Array<{ url: string }>
}

function containsPersonKeyword(prompt: string): boolean {
  return PERSON_KEYWORDS.some((kw) => prompt.includes(kw))
}

function buildNegativePrompt(): string {
  return PERSON_STYLE_GUIDE.never.map((term) => `NOT ${term}`).join(', ')
}

function buildFullPrompt(prompt: string, style: ImageStyle): string {
  const parts: string[] = [STYLE_PREFIXES[style]]

  if (containsPersonKeyword(prompt)) {
    // Randomly pick male or female style (deterministic based on prompt length)
    const personPrompt = prompt.length % 2 === 0
      ? PERSON_STYLE_GUIDE.femalePrompt
      : PERSON_STYLE_GUIDE.malePrompt
    parts.push(personPrompt)
    parts.push(buildNegativePrompt())
  }

  parts.push(prompt)
  parts.push(NO_TEXT_DIRECTIVE)

  return parts.join(' ')
}

function getDatePrefix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// ---------------------------------------------------------------------------
// Single image generation + upload
// ---------------------------------------------------------------------------

async function generateSingleImage(
  input: ImagePromptInput,
  datePrefix: string,
): Promise<CardNewsImageResult | null> {
  const fullPrompt = buildFullPrompt(input.prompt, input.style)

  try {
    // 1. Generate with DALL-E 3
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
    })

    if (!response.ok) {
      console.error(
        `[CardNewsImageGen] DALL-E API 에러 (슬라이드 ${input.slideIndex}):`,
        response.status,
        await response.text(),
      )
      return null
    }

    const data = (await response.json()) as DalleResponse
    const dalleUrl = data.data[0]?.url
    if (!dalleUrl) {
      console.error(`[CardNewsImageGen] 슬라이드 ${input.slideIndex}: URL 없음`)
      return null
    }

    // 2. Download image buffer
    const imgResponse = await fetch(dalleUrl)
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())

    // 3. Upload to R2
    const { uploadToR2 } = await import('../../../src/lib/r2.js')
    const key = `card-news/${datePrefix}/dalle-slide-${input.slideIndex}.png`
    const { url } = await uploadToR2(imgBuffer, key, 'image/png')

    console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} 업로드 완료`)

    return {
      url,
      prompt: fullPrompt,
      slideIndex: input.slideIndex,
    }
  } catch (err) {
    console.error(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} 생성 실패:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 카드뉴스 슬라이드용 이미지를 DALL-E 3로 생성하고 R2에 업로드합니다.
 *
 * - 이미지 생성은 병렬로 처리 (Promise.all)
 * - 개별 실패 시 해당 슬라이드만 건너뛰고 나머지 결과 반환
 * - OPENAI_API_KEY 미설정 시 빈 배열 반환
 * - 사람 관련 키워드 감지 시 한국인 스타일 가이드 자동 적용
 */
export async function generateCardNewsImages(
  imagePrompts: Array<{ slideIndex: number; prompt: string; style: ImageStyle }>,
): Promise<CardNewsImageResult[]> {
  if (!OPENAI_API_KEY) {
    console.warn('[CardNewsImageGen] OPENAI_API_KEY 없음 — 이미지 생성 스킵')
    return []
  }

  if (imagePrompts.length === 0) {
    return []
  }

  console.log(`[CardNewsImageGen] DALL-E 이미지 생성 중 (${imagePrompts.length}장)`)

  const datePrefix = getDatePrefix()

  const results = await Promise.all(
    imagePrompts.map((input) => generateSingleImage(input, datePrefix)),
  )

  // Filter out nulls (failed generations)
  return results.filter((r): r is CardNewsImageResult => r !== null)
}
