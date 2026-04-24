/**
 * Skill: Generate Image
 * DALL-E 3 API로 이미지 생성 (Gemini Imagen 4 → DALL-E 3 교체)
 *
 * 가격: $0.08/장 (HD) / $0.04/장 (Standard)
 * 환경변수: OPENAI_API_KEY
 *
 * DALL-E 3 제약:
 * - n=1 고정 (요청당 1장만)
 * - 지원 사이즈: 1024×1024 / 1792×1024 / 1024×1792
 * - 프롬프트 자동 개선 (revisedPrompt로 반환)
 *
 * // LOCAL ONLY — 이미지 생성 API 비용 발생
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const DALLE_API_URL = 'https://api.openai.com/v1/images/generations'

/** aspectRatio → DALL-E 3 지원 사이즈 매핑 */
const ASPECT_TO_SIZE: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
  '1:1':  '1024x1024',
  '4:3':  '1792x1024',
  '16:9': '1792x1024',
  '3:4':  '1024x1792',
  '9:16': '1024x1792',
}

export interface ImageGenerationOptions {
  prompt: string
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  quality?: 'standard' | 'hd'
  /** DALL-E 3는 n=1 고정, count는 무시됨 */
  count?: number
}

export interface GeneratedImage {
  buffer: Buffer
  prompt: string
  revisedPrompt?: string  // DALL-E 3가 자동 개선한 실제 사용 프롬프트
  model: string
  aspectRatio: string
}

/**
 * DALL-E 3로 이미지 생성
 * 반환: GeneratedImage 배열 (항상 1개 — DALL-E 3 제약)
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 환경변수 없음 — platform.openai.com에서 발급 필요')
  }

  const aspectRatio = options.aspectRatio ?? '16:9'
  const size = ASPECT_TO_SIZE[aspectRatio] ?? '1792x1024'
  const quality = options.quality ?? 'hd'

  const response = await fetch(DALLE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: options.prompt,
      n: 1,
      size,
      quality,
      style: 'natural',          // vivid 아닌 natural — 실사 느낌
      response_format: 'b64_json', // URL 만료 방지, base64 직접 수신
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`DALL-E 3 API 오류 ${response.status}: ${error}`)
  }

  const data = await response.json() as {
    data?: Array<{ b64_json: string; revised_prompt?: string }>
  }

  if (!data.data?.length) {
    throw new Error('DALL-E 3 이미지 생성 결과 없음')
  }

  return data.data.map(item => ({
    buffer: Buffer.from(item.b64_json, 'base64'),
    prompt: options.prompt,
    revisedPrompt: item.revised_prompt,
    model: 'dall-e-3',
    aspectRatio,
  }))
}

/**
 * 이미지 파일로 저장
 */
export async function saveGeneratedImage(
  image: GeneratedImage,
  outputDir: string,
  filename: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, filename.endsWith('.png') ? filename : `${filename}.png`)
  await fs.writeFile(filePath, image.buffer)
  if (image.revisedPrompt && image.revisedPrompt !== image.prompt) {
    // DALL-E 3가 프롬프트를 수정했으면 사이드카 파일로 기록
    const metaPath = filePath.replace('.png', '_prompt.txt')
    await fs.writeFile(metaPath, `Original:\n${image.prompt}\n\nRevised by DALL-E 3:\n${image.revisedPrompt}`)
  }
  return filePath
}

/**
 * 우나어 브랜드 프롬프트 빌더
 * 여성 전용 (50~60대 한국 여성) — AI 티 최소화
 */
export function buildBrandPrompt(options: {
  subject: string
  message?: string
  style?: 'photorealistic' | 'illustration'
  extraKeywords?: string[]
}): string {
  const baseStyle = options.style === 'illustration'
    ? 'warm 2D illustration style, soft colors, inclusive, hand-drawn feel'
    : [
        'lifestyle photography, photorealistic',
        'candid unposed moment, authentic expression',
        'shot on Canon EOS R5, 85mm f/1.4, f/2.0 aperture, shallow depth of field',
        'soft natural window light, no studio lighting',
        'natural skin texture, visible pores, subtle smile lines',
        'NOT plastic skin NOT airbrushed NOT AI art NOT CGI NOT stock photo',
        'film grain, Kodak Portra 400 color tones',
      ].join(', ')

  const brandContext = [
    'Korean woman who appears to be in her late 40s to early 50s, naturally aged',
    'similar natural look to Korean actress Jeon Do-yeon or Song Yoon-ah',
    'natural Korean facial features, minimal natural makeup',
    'warm coral #FF6F61 accent visible in clothing, cup, or background element',
    'approachable, trustworthy, warm atmosphere',
  ].join(', ')

  const extras = options.extraKeywords?.join(', ') ?? ''

  return [
    options.subject,
    options.message ?? '',
    baseStyle,
    brandContext,
    extras,
  ].filter(Boolean).join(', ')
}
