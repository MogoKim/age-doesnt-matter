/**
 * 매거진 로컬 이미지 생성기 (Playwright 기반)
 * Gemini Imagen / ChatGPT DALL-E 3 웹 UI 자동화로 DALL-E 3 API 대체
 *
 * // LOCAL ONLY — Playwright 브라우저 자동화 필요 (GitHub Actions 실행 불가)
 * // 사전 조건: Chrome 완전 종료 + gemini.google.com / chatgpt.com 로그인 세션 존재
 *
 * 사용: IMAGE_GENERATOR=gemini|chatgpt 환경변수 설정 → image-generator.ts가 자동 라우팅
 * ILLUSTRATION 타입: null 반환 → image-generator.ts가 DALL-E API로 폴백
 */

import type { ImageContext, ImageResult } from './image-generator.js'

// ─── R2 업로드 헬퍼 ──────────────────────────────────────────────────────────

async function uploadBufferToR2(buffer: Buffer, filename: string): Promise<string | null> {
  const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const R2_ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY
  const R2_SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.warn('[LocalImageGen] R2 미설정 — 이미지 저장 불가')
    return null
  }
  try {
    const { uploadToR2 } = await import('../../src/lib/r2.js')
    const key = `magazine/${filename}`
    const { url } = await uploadToR2(buffer, key, 'image/png')
    return url
  } catch (err) {
    console.error('[LocalImageGen] R2 업로드 실패:', err)
    return null
  }
}

// ─── 프롬프트 변환 ────────────────────────────────────────────────────────────

/**
 * ImageContext → Gemini Imagen 전용 프롬프트
 * - PERSON_REAL: 한국 여성 4050 실사 스타일 강제 (f/1.4 bokeh)
 * - FOOD/SCENE/OBJECT: 따뜻한 생활사진 스타일
 * - ILLUSTRATION: null 반환 → DALL-E API 폴백
 */
function buildGeminiPromptFromContext(ctx: ImageContext): string | null {
  if (ctx.type === 'ILLUSTRATION') return null

  if (ctx.type === 'PERSON_REAL') {
    return [
      'portrait of a stylish Korean woman in her late 40s',
      ctx.dallePrompt,
      'inspired by natural refined elegance of acclaimed Korean actresses born late 1960s to mid-1970s',
      'NOT resembling any specific individual',
      'naturally styled dark brown to dark black hair, very minimal gray, modern flattering cut',
      'candid unposed authentic lifestyle moment, warm confident expression',
      'shot on Canon EOS R5, 85mm f/1.4 portrait lens, soft bokeh',
      'soft natural window light or outdoor daylight',
      'natural skin texture, subtle aging details, vibrant for her age',
      'photorealistic high resolution, NOT AI art NOT stock photo',
      'subtle warm coral #FF6F61 accent in environment',
    ].join(', ')
  }

  const prefixMap: Record<string, string> = {
    FOOD_PHOTO:
      'photorealistic food photography, warm natural window lighting, '
      + 'fresh appetizing ingredients, Korean home cooking aesthetic, magazine editorial quality',
    SCENE_PHOTO:
      'photorealistic lifestyle photograph, warm golden natural lighting, '
      + 'Korean aesthetic sensibility, cinematic quality, inviting atmosphere',
    OBJECT_PHOTO:
      'photorealistic product photography, clean neutral background, '
      + 'professional soft studio lighting, sharp detail, magazine quality',
  }
  const prefix = prefixMap[ctx.type] ?? 'photorealistic high resolution'
  return `${prefix}, ${ctx.dallePrompt}, NOT AI art NOT stock photo`
}

/**
 * ImageContext → ChatGPT (DALL-E 3 웹 UI) 전용 프롬프트
 * - PERSON_REAL: "ONLY women present, no men" + f/5.6 sharp focus (bokeh 없음)
 * - FOOD/SCENE/OBJECT: 자연스러운 사진 스타일
 * - ILLUSTRATION: null 반환 → DALL-E API 폴백
 */
function buildChatGPTPromptFromContext(ctx: ImageContext): string | null {
  if (ctx.type === 'ILLUSTRATION') return null

  if (ctx.type === 'PERSON_REAL') {
    return [
      'ONLY women present, no men',
      `portrait of a stylish Korean woman in her late 40s, ${ctx.dallePrompt}`,
      'inspired by natural refined elegance of acclaimed Korean actresses born late 1960s to mid-1970s',
      'NOT resembling any specific individual',
      'naturally styled dark brown to dark black hair, very minimal gray, modern flattering cut',
      'candid unposed authentic lifestyle moment, warm confident smile',
      'shot on Canon EOS R5, 85mm portrait lens, sharp crisp focus, f/5.6 deep depth of field, NO blur NO bokeh',
      'soft natural window light or outdoor daylight',
      'photorealistic high resolution, NOT AI art NOT stock photo',
      'subtle warm coral #FF6F61 accent in environment',
    ].join(', ')
  }

  const prefixMap: Record<string, string> = {
    FOOD_PHOTO:
      'photorealistic food photography, warm natural window lighting, '
      + 'fresh ingredients, Korean home cooking style, magazine editorial quality',
    SCENE_PHOTO:
      'photorealistic lifestyle photograph, warm natural lighting, '
      + 'Korean aesthetic, wide composition, inviting and warm atmosphere',
    OBJECT_PHOTO:
      'photorealistic product photography, clean white or neutral background, '
      + 'professional studio lighting, sharp detail',
  }
  const prefix = prefixMap[ctx.type] ?? 'photorealistic high resolution'
  return `${prefix}, ${ctx.dallePrompt}, NOT AI art`
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * Playwright 기반 로컬 이미지 생성 + R2 업로드
 *
 * @returns ImageResult (R2 URL 포함) — 실패 시 null
 *          null 반환 시 image-generator.ts가 DALL-E API로 폴백
 */
export async function generateMagazineImageLocally(
  ctx: ImageContext,
  engine: 'gemini' | 'chatgpt',
): Promise<ImageResult | null> {
  const buildPrompt = engine === 'gemini'
    ? buildGeminiPromptFromContext
    : buildChatGPTPromptFromContext
  const prompt = buildPrompt(ctx)

  if (!prompt) {
    // ILLUSTRATION 타입 → DALL-E API 폴백
    console.log(`[LocalImageGen] ${ctx.type} ILLUSTRATION → DALL-E API 폴백`)
    return null
  }

  console.log(`[LocalImageGen] ${engine} 생성 시작 (${ctx.type})`)

  try {
    let buffer: Buffer | undefined

    if (engine === 'gemini') {
      const { generateWithGemini } = await import(
        '../design/graphic-designer/skills/gemini-scraper.js'
      )
      const results = await generateWithGemini(prompt, '1:1')
      buffer = results[0]?.buffer
    } else {
      const { generateWithChatGPT } = await import(
        '../design/graphic-designer/skills/chatgpt-scraper.js'
      )
      const results = await generateWithChatGPT(prompt, '1:1')
      buffer = results[0]?.buffer
    }

    if (!buffer || buffer.length < 10_000) {
      console.warn(`[LocalImageGen] ${engine} buffer 없거나 너무 작음 — 생성 실패`)
      return null
    }

    const filename = `magazine-${engine}-${Date.now()}.png`
    const r2Url = await uploadBufferToR2(buffer, filename)
    if (!r2Url) {
      // R2 실패 시 임시 URL 저장 금지 원칙 — null 반환
      console.error('[LocalImageGen] R2 업로드 실패 — 임시 URL 저장 금지')
      return null
    }

    console.log(`[LocalImageGen] ${engine} 성공 (${ctx.type}): ${r2Url.slice(0, 60)}...`)
    return { url: r2Url, prompt, source: 'local' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[LocalImageGen] ${engine} 생성 실패 (${ctx.type}): ${msg}`)
    return null
  }
}
