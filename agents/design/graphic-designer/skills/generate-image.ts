/**
 * Skill: Generate Image
 * Gemini Imagen 4 API로 이미지 생성
 *
 * 가격: $0.03/장 (Imagen 4) / $0.04/장 (Imagen 3 Pro)
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface ImageGenerationOptions {
  prompt: string
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  model?: 'imagen-4.0-generate-001' | 'imagen-3.0-generate-001'
  count?: number
}

export interface GeneratedImage {
  buffer: Buffer
  prompt: string
  model: string
  aspectRatio: string
}

/**
 * Gemini Imagen API 이미지 생성
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수 없음 — aistudio.google.com에서 발급 필요')

  const model = options.model ?? 'imagen-4.0-generate-001'
  const aspectRatio = options.aspectRatio ?? '16:9'
  const count = options.count ?? 1

  const response = await fetch(`${GEMINI_API_BASE}/${model}:predict?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{
        prompt: options.prompt,
      }],
      parameters: {
        sampleCount: count,
        aspectRatio,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini Imagen API 오류 ${response.status}: ${error}`)
  }

  const data = await response.json() as {
    predictions?: Array<{ bytesBase64Encoded: string }>
  }

  if (!data.predictions?.length) {
    throw new Error('이미지 생성 결과 없음')
  }

  return data.predictions.map(pred => ({
    buffer: Buffer.from(pred.bytesBase64Encoded, 'base64'),
    prompt: options.prompt,
    model,
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
  return filePath
}

/**
 * 우나어 브랜드 프롬프트 빌더
 * AI 티를 최소화하는 프롬프트 조합
 */
export function buildBrandPrompt(options: {
  subject: string
  message?: string
  style?: 'photorealistic' | 'illustration'
  extraKeywords?: string[]
}): string {
  const baseStyle = options.style === 'illustration'
    ? 'warm 2D illustration style, soft colors, inclusive'
    : 'lifestyle photography, photorealistic, candid, f/2.8 aperture, natural shadows, imperfect'

  const brandContext = 'Korean adults 50-60s, warm coral accent #FF6F61, approachable, trustworthy'
  const antiAI = 'NOT AI art, natural, realistic, documentary style'
  const extras = options.extraKeywords?.join(', ') ?? ''

  return [
    options.subject,
    options.message ?? '',
    baseStyle,
    brandContext,
    antiAI,
    extras,
  ].filter(Boolean).join(', ')
}
