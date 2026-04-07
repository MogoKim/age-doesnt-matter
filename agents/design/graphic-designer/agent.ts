/**
 * Graphic Designer Agent
 *
 * 역할: 우나어 그래픽/광고/SNS 이미지 생성 에이전트
 * - 구글 애즈 이미지 소재 생성 + 베리에이션
 * - SNS (인스타그램, 페이스북) 이미지 생성
 * - 매거진 썸네일 생성
 * - 브랜드 일관성 유지 (BRAND_VISUAL_GUIDE.md 기준)
 *
 * 실행: npx tsx agents/design/graphic-designer/agent.ts "[요청]"
 * 예시: npx tsx agents/design/graphic-designer/agent.ts "구글 애즈 이미지 3개 만들어줘"
 *
 * 의존: GEMINI_API_KEY 환경변수 필요
 *
 * // LOCAL ONLY — 이미지 생성 API 비용 발생, 크론 불필요
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const PROJECT_ROOT = path.join(__dirname, '../../..')
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets/generated')

/** 우나어 브랜드 이미지 생성 기본 프롬프트 */
export const BRAND_IMAGE_BASE_PROMPT = `
브랜드 스타일:
- 메인 컬러: 코랄 #FF6F61 (포인트 요소에 사용)
- 분위기: 따뜻하고 친근함, 신뢰감, 활력
- 타겟: 50~60대 한국인
- 금지: "시니어" 표현, 지나치게 젊은 모델
- 권장: 자연스러운 50~60대 모습, 따뜻한 조명, 일상적인 장면

이미지 품질:
- AI 티 줄이기: photorealistic, candid, imperfect, natural
- 실사 스타일: lifestyle photography, f/2.8 aperture, natural shadows
- 일러스트 스타일: warm 2D illustration, soft colors, inclusive
`

/** 채널별 사이즈 규격 */
export const AD_SIZES = {
  googleBanner: { width: 1200, height: 628, label: '1200x628' },
  googleSquare: { width: 300, height: 250, label: '300x250' },
  googleVertical: { width: 160, height: 600, label: '160x600' },
  instagramFeed: { width: 1080, height: 1080, label: '1080x1080' },
  instagramStory: { width: 1080, height: 1920, label: '1080x1920' },
  facebookAd: { width: 1200, height: 628, label: '1200x628_fb' },
  magazineThumbnail: { width: 800, height: 450, label: '800x450' },
}

/** Gemini Imagen API로 이미지 생성 */
export async function generateImage(prompt: string, size: { width: number; height: number }): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[Graphic Designer] GEMINI_API_KEY 없음. aistudio.google.com에서 발급 필요.')
    return null
  }

  const aspectRatio = size.width > size.height
    ? (size.width / size.height > 1.5 ? '16:9' : '4:3')
    : (size.height / size.width > 1.5 ? '9:16' : '3:4')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{
            prompt: `${prompt}\n\n${BRAND_IMAGE_BASE_PROMPT}`,
          }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('[Graphic Designer] Gemini API 오류:', response.status, await response.text())
      return null
    }

    const data = await response.json() as { predictions?: Array<{ bytesBase64Encoded: string }> }
    const imageData = data.predictions?.[0]?.bytesBase64Encoded
    if (!imageData) return null

    return Buffer.from(imageData, 'base64')
  } catch (err) {
    console.error('[Graphic Designer] 이미지 생성 실패:', err)
    return null
  }
}

/** 이미지 저장 */
async function saveImage(buffer: Buffer, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)
  console.log(`[Graphic Designer] 저장: ${outputPath}`)
}

/** Graphic Designer 메인 에이전트 */
export async function runGraphicDesigner(request: string): Promise<void> {
  console.log('[Graphic Designer] 요청 수신:', request)

  const brandGuide = await fs.readFile(
    path.join(PROJECT_ROOT, 'docs/design/BRAND_VISUAL_GUIDE.md'), 'utf-8'
  ).catch(() => '')

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const systemPrompt = `당신은 우나어 전담 그래픽 디자이너입니다.

서비스: 우리 나이가 어때서 (우나어) — 50~60대 커뮤니티
브랜드 컬러: #FF6F61 (코랄)
금지: "시니어" 표현

역할:
1. 요청에 맞는 이미지 생성 프롬프트 작성 (영어로)
2. generateImage() 함수 호출 계획 작성
3. 저장 경로: assets/generated/[타입]/[날짜]_[설명]/
4. 브랜드 일관성 유지 (BRAND_VISUAL_GUIDE.md 참조)

오늘 날짜: ${today}

이미지 생성 시 반드시:
- AI 티 방지: "photorealistic, candid, imperfect, natural shadows" 포함
- 브랜드 컬러 포인트 포함
- 50~60대 한국인 타겟 반영`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `브랜드 가이드:\n${brandGuide.slice(0, 2000)}\n\n요청: ${request}`,
      },
    ],
  })

  const result = response.content[0]
  if (result.type === 'text') {
    console.log('[Graphic Designer] 계획:\n', result.text)
    // 실제 이미지 생성은 에이전트의 계획을 기반으로 실행
    // TODO: 에이전트 출력에서 프롬프트 파싱 → generateImage() 자동 호출
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? '구글 애즈 이미지 소재 1개 테스트해줘'
  runGraphicDesigner(request).catch(console.error)
}
