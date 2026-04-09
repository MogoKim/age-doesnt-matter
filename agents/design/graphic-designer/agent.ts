/**
 * Graphic Designer Agent
 *
 * 역할: 우나어 그래픽/광고/SNS 이미지 생성 에이전트
 * - 구글 애즈 이미지 소재 생성 + 베리에이션
 * - SNS (인스타그램, 페이스북) 이미지 생성
 * - 매거진 썸네일 생성
 * - 브랜드 일관성 유지
 *
 * 실행: npx tsx agents/design/graphic-designer/agent.ts "[요청]"
 * 예시: npx tsx agents/design/graphic-designer/agent.ts "구글 애즈 이미지 RELATION 욕망 2개 만들어줘"
 *
 * 의존: OPENAI_API_KEY, ANTHROPIC_API_KEY 환경변수 필요
 * 비용: $0.08/장(HD DALL-E 3) + $0.003/계획(Haiku) — 8장 기준 ~$0.66
 *
 * // LOCAL ONLY — 이미지 생성 API 비용 발생, 크론 불필요
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { generateImage, saveGeneratedImage } from './skills/generate-image.js'
import type { ImageGenerationOptions } from './skills/generate-image.js'
import { checkBrandCompliance, reportBrandCheck } from './brand-guardian.js'
import { sendSlackMessage } from '../../core/notifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
// 계획 수립은 Haiku(빠르고 저렴) — 실제 이미지 생성 비용이 압도적
const PLANNER_MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'
const PROJECT_ROOT = path.join(__dirname, '../../..')
const REVIEW_BASE = path.join(PROJECT_ROOT, 'assets/review')

// ─── 플래너 출력 스키마 ────────────────────────────────────────────────────

interface ImageSpec {
  filename: string         // 예: "relation_cafe_emotional.png"
  desire: string           // RELATION | RETIRE | MONEY | HEALTH
  hook: string             // 감성훅 | 실용훅
  aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
  quality: 'standard' | 'hd'
  prompt: string           // 영어 DALL-E 3 프롬프트
  description: string      // 한국어 소재 설명 (검토용)
}

interface PlannerOutput {
  images: ImageSpec[]
  summary: string          // 전체 배치 한 줄 요약
}

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `당신은 우나어 전담 그래픽 디자이너입니다.

서비스: 우리 나이가 어때서 (우나어) — 50~60대 한국 여성 커뮤니티
브랜드 컬러: #FF6F61 (코랄)
타겟: 한국 여성 50~60대 — "시니어" 금지, "우리 또래", "인생 2막" 표현
광고 소재: 여성 100% — 남성 이미지/남성 타겟 카피 절대 금지

욕망 우선순위:
1. RELATION (관계·소속감) — 배경: 카페, 감성훅
2. RETIRE (은퇴 준비) — 배경: 도서관/문화센터, 실용훅
3. MONEY (재정 안정) — 배경: 거실, 실용훅
4. HEALTH (건강·활력) — 배경: 공원, 감성훅

DALL-E 3 프롬프트 7계층 구조 (반드시 준수):
1. 피사체: Korean woman, late 40s appearance (Jeon Do-yeon / Song Yoon-ah reference)
2. 의상: relaxed Korean casual fashion, linen/knit, NOT hospital gown
3. 자연스러움: candid unposed moment, genuine expression, NOT posing
4. 카메라: shot on Canon EOS R5, 85mm f/1.4, f/2.0 aperture, shallow depth of field
5. 조명: soft natural window light, no studio lighting, no flash
6. 피부: natural skin texture, visible pores, subtle smile lines, NOT airbrushed
7. 품질: film grain, Kodak Portra 400, lifestyle photography, NOT AI art NOT CGI NOT stock photo

결과물을 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이 순수 JSON만:
{
  "images": [
    {
      "filename": "욕망_장면_훅타입.png",
      "desire": "RELATION|RETIRE|MONEY|HEALTH",
      "hook": "감성훅|실용훅",
      "aspectRatio": "16:9",
      "quality": "hd",
      "prompt": "영어로 작성된 DALL-E 3 프롬프트",
      "description": "한국어 소재 설명"
    }
  ],
  "summary": "전체 배치 한 줄 요약"
}`
}

// ─── 플래너: Claude → 이미지 스펙 JSON 생성 ──────────────────────────────

async function planImages(request: string): Promise<PlannerOutput> {
  const today = new Date().toISOString().slice(0, 10)

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: `오늘: ${today}\n\n요청: ${request}\n\n위 요청을 분석해 이미지 스펙 JSON을 생성하세요. 순수 JSON만 출력.`,
      },
    ],
  })

  const raw = response.content[0]
  if (raw.type !== 'text') throw new Error('플래너 응답 없음')

  // JSON 추출 (```json 코드 블록 대응)
  const jsonMatch = raw.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`플래너 JSON 파싱 실패:\n${raw.text.slice(0, 500)}`)

  try {
    return JSON.parse(jsonMatch[0]) as PlannerOutput
  } catch {
    throw new Error(`플래너 JSON 파싱 오류:\n${jsonMatch[0].slice(0, 500)}`)
  }
}

// ─── 실행 루프: 스펙 → DALL-E 3 → 파일 저장 → 브랜드 검증 ──────────────

interface GenerationResult {
  spec: ImageSpec
  savedPath: string
  brandCheck?: Awaited<ReturnType<typeof checkBrandCompliance>>
  error?: string
}

async function executeImageGeneration(
  spec: ImageSpec,
  outputDir: string
): Promise<GenerationResult> {
  console.log(`\n[Graphic Designer] 생성 중: ${spec.filename}`)
  console.log(`  욕망: ${spec.desire} | 훅: ${spec.hook} | 비율: ${spec.aspectRatio}`)
  console.log(`  소재: ${spec.description}`)

  try {
    const options: ImageGenerationOptions = {
      prompt: spec.prompt,
      aspectRatio: spec.aspectRatio,
      quality: spec.quality ?? 'hd',
    }

    const [generated] = await generateImage(options)
    const savedPath = await saveGeneratedImage(generated, outputDir, spec.filename)

    console.log(`  ✅ 저장: ${savedPath}`)
    if (generated.revisedPrompt && generated.revisedPrompt !== generated.prompt) {
      console.log(`  📝 DALL-E 3 프롬프트 수정됨 — _prompt.txt 저장`)
    }

    // 브랜드 검증 (OPENAI_API_KEY가 있으면 실행)
    let brandCheck: GenerationResult['brandCheck']
    try {
      brandCheck = await checkBrandCompliance(savedPath)
      reportBrandCheck(brandCheck, spec.filename)
    } catch (err) {
      console.warn(`  ⚠️ 브랜드 검증 스킵:`, (err as Error).message)
    }

    return { spec, savedPath, brandCheck }
  } catch (err) {
    const errorMsg = (err as Error).message
    console.error(`  ❌ 실패: ${errorMsg}`)
    return { spec, savedPath: '', error: errorMsg }
  }
}

// ─── Slack 결과 보고 ────────────────────────────────────────────────────

async function notifyResults(
  results: GenerationResult[],
  outputDir: string,
  summary: string
): Promise<void> {
  const total = results.length
  const succeeded = results.filter((r) => !r.error).length
  const failed = total - succeeded
  const brandPassed = results.filter((r) => r.brandCheck?.overallFit === 'PASS').length

  const lines = [
    `*Graphic Designer 이미지 생성 완료*`,
    ``,
    `📊 결과: ${succeeded}/${total}장 성공 | 브랜드 통과: ${brandPassed}장`,
    `📁 저장 위치: \`${outputDir.replace(PROJECT_ROOT, '')}\``,
    ``,
    `소재 요약: ${summary}`,
    ``,
    ...results.map((r) => {
      if (r.error) return `❌ ${r.spec.filename} — ${r.error}`
      const brand = r.brandCheck
        ? (r.brandCheck.overallFit === 'PASS' ? '✅ 브랜드 OK' : `⚠️ ${r.brandCheck.notes}`)
        : '브랜드 검증 스킵'
      return `✅ ${r.spec.filename} (${r.spec.desire}/${r.spec.hook}) — ${brand}`
    }),
    ...(failed > 0 ? [``, `⚠️ 실패 ${failed}장은 assets/review 폴더에서 확인`] : []),
  ]

  await sendSlackMessage('AGENT', lines.join('\n'))
}

// ─── 메인 에이전트 ────────────────────────────────────────────────────────

export async function runGraphicDesigner(request: string): Promise<void> {
  console.log('[Graphic Designer] 요청:', request)
  console.log('[Graphic Designer] Step 1: 이미지 스펙 계획 수립...')

  // 1. Claude로 이미지 스펙 계획 수립
  const plan = await planImages(request)
  console.log(`\n[Graphic Designer] 계획 완료 — ${plan.images.length}장`)
  console.log(`요약: ${plan.summary}`)
  plan.images.forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.filename} — ${img.desire}/${img.hook} (${img.aspectRatio})`)
  })

  // 2. 저장 디렉토리 생성
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const outputDir = path.join(REVIEW_BASE, dateStr)
  await fs.mkdir(outputDir, { recursive: true })
  console.log(`\n[Graphic Designer] Step 2: DALL-E 3 이미지 생성 (${plan.images.length}장)...`)
  console.log(`저장 경로: ${outputDir}`)

  // 3. 순차 실행 (DALL-E 3 rate limit 고려, 병렬 금지)
  const results: GenerationResult[] = []
  for (const spec of plan.images) {
    const result = await executeImageGeneration(spec, outputDir)
    results.push(result)
    // Rate limit 방지: 장당 1초 대기
    if (plan.images.indexOf(spec) < plan.images.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  // 4. 결과 요약
  const succeeded = results.filter((r) => !r.error).length
  console.log(`\n[Graphic Designer] 완료: ${succeeded}/${results.length}장 성공`)
  console.log(`📁 리뷰 폴더: ${outputDir}`)

  // 5. Slack 알림
  await notifyResults(results, outputDir, plan.summary)
}

// ─── CLI 진입점 ────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? 'RELATION 욕망 구글 애즈 소재 1개 테스트 (16:9)'
  runGraphicDesigner(request).catch((err) => {
    console.error('[Graphic Designer] 치명적 오류:', err)
    process.exit(1)
  })
}
