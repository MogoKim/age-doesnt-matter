/**
 * 카드뉴스 v2 이미지 생성기 — DALL-E 3 + R2 업로드
 * 슬라이드별 프롬프트를 받아 병렬로 이미지 생성 후 R2에 업로드
 *
 * 이미지 생성 규칙: agents/core/image-generation-rules.md
 * 프롬프트 빌더: agents/core/image-prompt-builder.ts
 */
import { buildImagePrompt, type ImageStyle } from '../../core/image-prompt-builder.js'

// Re-export ImageStyle for consumers
export type { ImageStyle }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardNewsImageResult {
  url: string          // R2 uploaded URL
  prompt: string       // used prompt
  slideIndex: number   // which slide this is for
}

interface ImagePromptInput {
  slideIndex: number
  prompt: string
  style: ImageStyle
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DalleResponse {
  data: Array<{ url: string }>
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
  const fullPrompt = buildImagePrompt(input.prompt, input.style)

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
