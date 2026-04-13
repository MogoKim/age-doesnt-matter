/**
 * 매거진 AI 이미지 생성기
 * 기사당 히어로 이미지 1장 + 본문 이미지 최대 2장 생성
 *
 * v2 전략:
 * - PERSON_REAL / ILLUSTRATION → DALL-E 3 전용
 * - FOOD_PHOTO / SCENE_PHOTO / OBJECT_PHOTO → Unsplash 우선, DALL-E 폴백
 * 비용: Unsplash 무료 / DALL-E $0.04/장 (standard 1024x1024)
 *
 * 이미지 생성 규칙: agents/core/image-generation-rules.md
 * 프롬프트 빌더: agents/core/image-prompt-builder.ts
 */
import {
  buildImagePrompt,
  buildImagePromptByType,
  getMagazineImageStyle,
  type ImageStyle,
  type ImageContext,
  type ImageType,
} from '../core/image-prompt-builder.js'

// Re-export for consumers
export { getMagazineImageStyle as getImageStyle }
export type { ImageStyle, ImageContext, ImageType }

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

export interface ImageResult {
  url: string       // R2 uploaded URL
  prompt: string    // used prompt for logging
  source: 'dalle' | 'unsplash' | 'local'
}

// ---------------------------------------------------------------------------
// Unsplash API (v2) — 실사 사진 우선 취득
// ---------------------------------------------------------------------------

/** Unsplash에서 사진 1장을 랜덤으로 가져와 R2에 업로드 후 URL 반환 */
async function fetchUnsplashPhoto(query: string): Promise<string | null> {
  if (!UNSPLASH_ACCESS_KEY) return null

  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    })

    if (!response.ok) {
      console.warn(`[ImageGen] Unsplash 응답 오류: ${response.status}`)
      return null
    }

    const data = await response.json() as {
      urls?: { regular?: string }
      links?: { download_location?: string }
    }

    const photoUrl = data?.urls?.regular
    if (!photoUrl) return null

    // Unsplash 다운로드 통계 트리거 (이용약관 준수)
    if (data?.links?.download_location) {
      fetch(`${data.links.download_location}?client_id=${UNSPLASH_ACCESS_KEY}`).catch(() => {})
    }

    // R2에 업로드
    const r2Url = await uploadToR2(photoUrl, `magazine-unsplash-${Date.now()}.jpg`)
    return r2Url ?? photoUrl
  } catch (err) {
    console.warn('[ImageGen] Unsplash 조회 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// v2: 이미지 컨텍스트 기반 생성 (매거진 전용)
// ---------------------------------------------------------------------------

const UNSPLASH_ELIGIBLE: ImageType[] = ['FOOD_PHOTO', 'SCENE_PHOTO', 'OBJECT_PHOTO']

/**
 * v2: ImageContext를 받아 최적 방식으로 이미지 생성
 * - FOOD/SCENE/OBJECT + unsplashQuery 있음 → Unsplash 우선
 * - PERSON_REAL / ILLUSTRATION / Unsplash 실패 → DALL-E
 */
export async function generateMagazineImageByContext(
  context: ImageContext,
): Promise<ImageResult | null> {
  // LOCAL ONLY — IMAGE_GENERATOR env var 설정 시 Playwright 로컬 엔진 우선
  const localEngine = process.env.IMAGE_GENERATOR as 'gemini' | 'chatgpt' | undefined
  if (localEngine === 'gemini' || localEngine === 'chatgpt') {
    const { generateMagazineImageLocally } = await import('./local-image-generator.js')
    const localResult = await generateMagazineImageLocally(context, localEngine)
    if (localResult) return localResult
    // null이면 ILLUSTRATION 타입이거나 생성 실패 → DALL-E/Unsplash 폴백
    console.log(`[ImageGen] 로컬 생성 null → DALL-E/Unsplash 폴백 (${context.type})`)
  }

  // Unsplash 시도 (해당 타입 + 검색어 있을 때)
  if (context.unsplashQuery && UNSPLASH_ELIGIBLE.includes(context.type)) {
    const unsplashUrl = await fetchUnsplashPhoto(context.unsplashQuery)
    if (unsplashUrl) {
      console.log(`[ImageGen] Unsplash 성공 (${context.type}): ${unsplashUrl.slice(0, 60)}...`)
      return { url: unsplashUrl, prompt: `unsplash:${context.unsplashQuery}`, source: 'unsplash' }
    }
    console.log(`[ImageGen] Unsplash 실패 → DALL-E 폴백 (${context.type})`)
  }

  // DALL-E 생성
  if (!OPENAI_API_KEY) {
    console.log('[ImageGen] OPENAI_API_KEY 없음 — 이미지 생성 스킵')
    return null
  }

  const fullPrompt = buildImagePromptByType(context.dallePrompt, context.type)
  return callDallE(fullPrompt)
}

// ---------------------------------------------------------------------------
// v1: 기존 API 하위 호환 (카드뉴스 등에서 사용)
// ---------------------------------------------------------------------------

/**
 * v1: 프롬프트 + ImageStyle로 DALL-E 이미지 생성
 */
export async function generateMagazineImage(
  prompt: string,
  style: ImageStyle = 'warm-lifestyle',
): Promise<ImageResult | null> {
  if (!OPENAI_API_KEY) {
    console.log('[ImageGen] OPENAI_API_KEY 없음 — 이미지 생성 스킵')
    return null
  }

  const fullPrompt = buildImagePrompt(prompt, style)
  return callDallE(fullPrompt)
}

// ---------------------------------------------------------------------------
// DALL-E 공통 호출
// ---------------------------------------------------------------------------

async function callDallE(fullPrompt: string): Promise<ImageResult | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
      console.error('[ImageGen] DALL-E API 에러:', response.status, await response.text())
      return null
    }

    const data = await response.json() as { data: Array<{ url: string }> }
    const imageUrl = data.data[0]?.url
    if (!imageUrl) return null

    const r2Url = await uploadToR2(imageUrl, `magazine-${Date.now()}.png`)
    if (!r2Url) {
      // R2 업로드 실패 시 OpenAI 임시 URL은 1시간 후 만료되므로 null 반환
      // (임시 URL을 저장하면 1시간 후 이미지 깨짐)
      console.error('[ImageGen] R2 업로드 실패 — 이미지 null 반환 (임시 URL 저장 금지)')
      return null
    }

    return {
      url: r2Url,
      prompt: fullPrompt,
      source: 'dalle',
    }
  } catch (err) {
    console.error('[ImageGen] 이미지 생성 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// R2 업로드
// ---------------------------------------------------------------------------

async function uploadToR2(sourceUrl: string, filename: string): Promise<string | null> {
  const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const R2_ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY
  const R2_SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.log('[ImageGen] R2 미설정 — 원본 URL 사용 (임시)')
    return null
  }

  try {
    const imgResponse = await fetch(sourceUrl)
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())

    const { uploadToR2: r2Upload } = await import('../../src/lib/r2.js')
    const key = `magazine/${filename}`
    const { url } = await r2Upload(imgBuffer, key, filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png')

    return url
  } catch (err) {
    console.error('[ImageGen] R2 업로드 실패:', err)
    return null
  }
}
