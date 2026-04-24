/**
 * 카드뉴스 v2 이미지 생성기 — Unsplash 우선 + DALL-E 3 fallback + R2 업로드
 * 슬라이드별 프롬프트를 받아 병렬로 이미지 생성 후 R2에 업로드
 *
 * 전략:
 * - slideIndex === 0 (Hook 슬라이드): DALL-E 우선 (브랜드 인상), 실패 시 Unsplash
 * - 나머지 슬라이드: Unsplash 우선 (무료), 실패 시 DALL-E fallback
 * - UNSPLASH_ACCESS_KEY 미설정 시 DALL-E 전용으로 동작
 * 비용: Unsplash 무료 / DALL-E $0.04/장 (standard 1024x1024)
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
  source: 'dalle' | 'unsplash'  // which service generated the image
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
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

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
// Unsplash API — 무료 실사 사진 취득
// ---------------------------------------------------------------------------

interface UnsplashSearchResult {
  results: Array<{
    urls?: { regular?: string }
    links?: { download_location?: string }
  }>
}

/**
 * Unsplash에서 키워드 검색 후 랜덤 1장 URL 반환
 * squarish orientation으로 카드뉴스에 적합한 비율 우선 취득
 * 실패 시 null 반환
 */
async function searchUnsplash(query: string): Promise<string | null> {
  if (!UNSPLASH_ACCESS_KEY) return null

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=squarish&content_filter=high`
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    })

    if (!response.ok) {
      console.warn(`[CardNewsImageGen] Unsplash 응답 오류: ${response.status}`)
      return null
    }

    const data = (await response.json()) as UnsplashSearchResult
    const results = data?.results ?? []
    if (results.length === 0) return null

    // 결과 중 랜덤 1개 선택
    const picked = results[Math.floor(Math.random() * results.length)]
    const photoUrl = picked?.urls?.regular
    if (!photoUrl) return null

    // Unsplash 다운로드 통계 트리거 (이용약관 준수)
    if (picked?.links?.download_location) {
      fetch(`${picked.links.download_location}?client_id=${UNSPLASH_ACCESS_KEY}`).catch(() => {})
    }

    return photoUrl
  } catch (err) {
    console.warn('[CardNewsImageGen] Unsplash 조회 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// R2 업로드 공통 헬퍼
// ---------------------------------------------------------------------------

async function uploadBufferToR2(
  sourceUrl: string,
  key: string,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<string | null> {
  try {
    const imgResponse = await fetch(sourceUrl)
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
    const { uploadToR2 } = await import('../../../src/lib/r2.js')
    const { url } = await uploadToR2(imgBuffer, key, mimeType)
    return url
  } catch (err) {
    console.error('[CardNewsImageGen] R2 업로드 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// DALL-E 3 생성 + R2 업로드
// ---------------------------------------------------------------------------

async function generateWithDallE(
  fullPrompt: string,
  r2Key: string,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null

  try {
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
      console.error('[CardNewsImageGen] DALL-E API 에러:', response.status, await response.text())
      return null
    }

    const data = (await response.json()) as DalleResponse
    const dalleUrl = data.data[0]?.url
    if (!dalleUrl) return null

    const r2Url = await uploadBufferToR2(dalleUrl, r2Key, 'image/png')
    if (!r2Url) {
      // R2 실패 시 임시 URL 저장 금지 (1시간 후 만료)
      console.error('[CardNewsImageGen] R2 업로드 실패 — DALL-E 임시 URL 저장 금지')
      return null
    }

    return r2Url
  } catch (err) {
    console.error('[CardNewsImageGen] DALL-E 생성 실패:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Single image generation + upload
// ---------------------------------------------------------------------------

async function generateSingleImage(
  input: ImagePromptInput,
  datePrefix: string,
): Promise<CardNewsImageResult | null> {
  const fullPrompt = buildImagePrompt(input.prompt, input.style)
  const isHookSlide = input.slideIndex === 0

  try {
    if (isHookSlide) {
      // Hook 슬라이드 (slideIndex 0): DALL-E 우선 — 브랜드 첫인상이 중요
      console.log(`[CardNewsImageGen] 슬라이드 0 (Hook) — DALL-E 우선`)
      const dalleKey = `card-news/${datePrefix}/dalle-slide-${input.slideIndex}.png`
      const dalleUrl = await generateWithDallE(fullPrompt, dalleKey)
      if (dalleUrl) {
        console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} DALL-E 성공`)
        return { url: dalleUrl, prompt: fullPrompt, slideIndex: input.slideIndex, source: 'dalle' }
      }

      // DALL-E 실패 시 Unsplash fallback
      console.warn(`[CardNewsImageGen] 슬라이드 0 DALL-E 실패 → Unsplash fallback`)
      const unsplashRaw = await searchUnsplash(input.prompt)
      if (unsplashRaw) {
        const unsplashKey = `card-news/${datePrefix}/unsplash-slide-${input.slideIndex}.jpg`
        const r2Url = await uploadBufferToR2(unsplashRaw, unsplashKey, 'image/jpeg')
        if (r2Url) {
          console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} Unsplash fallback 성공`)
          return { url: r2Url, prompt: `unsplash:${input.prompt}`, slideIndex: input.slideIndex, source: 'unsplash' }
        }
      }

      console.error(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} 모든 시도 실패`)
      return null
    } else {
      // 일반 슬라이드: Unsplash 우선 — 비용 절감
      console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} — Unsplash 우선`)
      const unsplashRaw = await searchUnsplash(input.prompt)
      if (unsplashRaw) {
        const unsplashKey = `card-news/${datePrefix}/unsplash-slide-${input.slideIndex}.jpg`
        const r2Url = await uploadBufferToR2(unsplashRaw, unsplashKey, 'image/jpeg')
        if (r2Url) {
          console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} Unsplash 성공`)
          return { url: r2Url, prompt: `unsplash:${input.prompt}`, slideIndex: input.slideIndex, source: 'unsplash' }
        }
      }

      // Unsplash 실패 시 DALL-E fallback
      console.warn(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} Unsplash 실패 → DALL-E fallback`)
      if (!OPENAI_API_KEY) {
        console.error(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} OPENAI_API_KEY 없음 — 생성 불가`)
        return null
      }

      const dalleKey = `card-news/${datePrefix}/dalle-slide-${input.slideIndex}.png`
      const dalleUrl = await generateWithDallE(fullPrompt, dalleKey)
      if (dalleUrl) {
        console.log(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} DALL-E fallback 성공`)
        return { url: dalleUrl, prompt: fullPrompt, slideIndex: input.slideIndex, source: 'dalle' }
      }

      console.error(`[CardNewsImageGen] 슬라이드 ${input.slideIndex} 모든 시도 실패`)
      return null
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
 * 카드뉴스 슬라이드용 이미지를 생성하고 R2에 업로드합니다.
 *
 * 전략:
 * - slideIndex 0 (Hook): DALL-E 우선, 실패 시 Unsplash fallback
 * - 나머지 슬라이드: Unsplash 우선 (무료), 실패 시 DALL-E fallback
 * - UNSPLASH_ACCESS_KEY 미설정 시 DALL-E 전용 동작
 * - OPENAI_API_KEY 미설정 시 빈 배열 반환 (Unsplash만 동작)
 *
 * - 이미지 생성은 병렬로 처리 (Promise.all)
 * - 개별 실패 시 해당 슬라이드만 건너뛰고 나머지 결과 반환
 */
export async function generateCardNewsImages(
  imagePrompts: Array<{ slideIndex: number; prompt: string; style: ImageStyle }>,
): Promise<CardNewsImageResult[]> {
  if (!OPENAI_API_KEY && !UNSPLASH_ACCESS_KEY) {
    console.warn('[CardNewsImageGen] OPENAI_API_KEY, UNSPLASH_ACCESS_KEY 모두 없음 — 이미지 생성 스킵')
    return []
  }

  if (imagePrompts.length === 0) {
    return []
  }

  const unsplashEnabled = !!UNSPLASH_ACCESS_KEY
  console.log(
    `[CardNewsImageGen] 이미지 생성 중 (${imagePrompts.length}장) — Unsplash: ${unsplashEnabled ? '활성' : '비활성 (DALL-E 전용)'}`,
  )

  const datePrefix = getDatePrefix()

  const results = await Promise.all(
    imagePrompts.map((input) => generateSingleImage(input, datePrefix)),
  )

  // Filter out nulls (failed generations)
  const succeeded = results.filter((r): r is CardNewsImageResult => r !== null)
  const dalleCount = succeeded.filter((r) => r.source === 'dalle').length
  const unsplashCount = succeeded.filter((r) => r.source === 'unsplash').length
  console.log(
    `[CardNewsImageGen] 완료: 총 ${succeeded.length}장 (DALL-E: ${dalleCount}장, Unsplash: ${unsplashCount}장)`,
  )

  return succeeded
}
