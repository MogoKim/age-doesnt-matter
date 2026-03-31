/**
 * 매거진 AI 이미지 생성기 — DALL-E 3
 * 기사당 히어로 이미지 1장 + 본문 이미지 최대 2장 생성
 * 비용: $0.04/장 (standard 1024x1024)
 *
 * 이미지 생성 규칙: agents/core/image-generation-rules.md
 * 프롬프트 빌더: agents/core/image-prompt-builder.ts
 */
import {
  buildImagePrompt,
  getMagazineImageStyle,
  type ImageStyle,
} from '../core/image-prompt-builder.js'

// Re-export for consumers
export { getMagazineImageStyle as getImageStyle }
export type { ImageStyle }

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

interface ImageResult {
  url: string        // R2 uploaded URL
  prompt: string     // used prompt for logging
}

export async function generateMagazineImage(
  prompt: string,
  style: ImageStyle = 'warm-lifestyle'
): Promise<ImageResult | null> {
  if (!OPENAI_API_KEY) {
    console.log('[ImageGen] OPENAI_API_KEY 없음 — 이미지 생성 스킵')
    return null
  }

  try {
    const fullPrompt = buildImagePrompt(prompt, style)

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

    // Try to upload to R2 if available
    const r2Url = await uploadToR2(imageUrl, `magazine-${Date.now()}.png`)

    return {
      url: r2Url ?? imageUrl,
      prompt: fullPrompt,
    }
  } catch (err) {
    console.error('[ImageGen] 이미지 생성 실패:', err)
    return null
  }
}

async function uploadToR2(sourceUrl: string, filename: string): Promise<string | null> {
  // Check for R2 credentials
  const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const R2_ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY
  const R2_SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.log('[ImageGen] R2 미설정 — DALL-E 임시 URL 사용 (1시간 후 만료)')
    return null
  }

  try {
    // Download image from DALL-E
    const imgResponse = await fetch(sourceUrl)
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())

    // Use the shared R2 upload utility
    const { uploadToR2: r2Upload } = await import('../../src/lib/r2.js')
    const key = `magazine/${filename}`
    const { url } = await r2Upload(imgBuffer, key, 'image/png')

    return url
  } catch (err) {
    console.error('[ImageGen] R2 업로드 실패:', err)
    return null
  }
}
