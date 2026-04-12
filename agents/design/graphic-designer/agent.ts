/**
 * Graphic Designer Agent — Generator-Evaluator-Evolver 루프
 *
 * 역할: 우나어 광고 소재 이미지 자동 생성 + 자기진화
 * 흐름: Planner → Generator → Evaluator → (FAIL) → Evolver → Generator → ...
 *
 * 실행: npx tsx agents/design/graphic-designer/agent.ts "[요청]"
 * 예시: IMAGE_GENERATOR=chatgpt npx tsx agents/design/graphic-designer/agent.ts "RELATION 소재 1번 테스트"
 *
 * 환경변수:
 * - IMAGE_GENERATOR=gemini   → Playwright + Gemini (기본값)
 * - IMAGE_GENERATOR=chatgpt  → Playwright + ChatGPT (DALL-E 3)
 * - IMAGE_GENERATOR=dalle    → DALL-E 3 API 직접 호출
 * - ANTHROPIC_API_KEY — Planner(Haiku) + Evaluator(Haiku) + Evolver(Sonnet)
 * - OPENAI_API_KEY   — IMAGE_GENERATOR=dalle 시 DALL-E 3
 *
 * 비용: gemini/chatgpt 사용 시 무료(구독) + $0.003/검증(Haiku) + $0.015/진화(Sonnet)
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
import { generateWithGemini, closeGeminiBrowser } from './skills/gemini-scraper.js'
import { generateWithChatGPT, closeChatGPTBrowser } from './skills/chatgpt-scraper.js'
import { checkBrandCompliance, reportBrandCheck, isBrandCheckPassed } from './brand-guardian.js'
import type { BrandCheckResult } from './brand-guardian.js'
import { evolvePrompt, formatEvolutionHistory } from './skills/prompt-evolver.js'
import type { PromptEvolutionRecord } from './skills/prompt-evolver.js'
import { sendSlackMessage } from '../../core/notifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const PLANNER_MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'
const GENERATOR = (process.env.IMAGE_GENERATOR ?? 'gemini') as 'gemini' | 'chatgpt' | 'dalle'
const MAX_ATTEMPTS = 3

const PROJECT_ROOT = path.join(__dirname, '../../..')
const REVIEW_BASE = path.join(PROJECT_ROOT, 'assets/review')

// ─── 플래너 출력 스키마 ────────────────────────────────────────────────────────

interface ImageSpec {
  filename: string
  desire: string           // RELATION | RETIRE | MONEY | HEALTH
  hook: string             // 감성훅 | 실용훅
  aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
  quality: 'standard' | 'hd'
  prompt: string           // 영어 DALL-E 3 / Gemini 프롬프트
  description: string      // 한국어 소재 설명 (Evaluator sceneMatch 기준)
}

interface PlannerOutput {
  images: ImageSpec[]
  summary: string
}

// ─── 실행 결과 타입 ───────────────────────────────────────────────────────────

interface GenerationResult {
  spec: ImageSpec
  savedPath: string
  brandCheck?: BrandCheckResult
  attempts: number          // 최종 성공까지 시도 횟수
  passed: boolean
  evolutionHistory: PromptEvolutionRecord[]
  error?: string
}

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────────

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

프롬프트 7계층 구조 (반드시 준수):
1. 피사체: Korean woman in her late 40s, urban sophisticated style — natural laugh lines at eye corners, confident warm smile, dark hair (mostly black or dark brown, almost no grey — less than 10% grey strands), stylish casual wardrobe in muted elegant tones, the elegance and charisma of a successful professional woman who has lived life fully, NOT a young woman NOT a celebrity face NOT a specific person
2. 의상: relaxed Korean casual fashion, linen/knit, NOT hospital gown
3. 자연스러움: candid unposed moment, genuine expression, NOT posing
4. 카메라: ${GENERATOR === 'chatgpt' || GENERATOR === 'dalle'
    ? 'shot on Canon EOS R5, 85mm portrait lens, sharp crisp focus on faces, everything sharply in focus, deep depth of field f/5.6, NO blur NO bokeh NO shallow depth of field'
    : 'shot on Canon EOS R5, 85mm f/1.4, f/2.0 aperture, shallow depth of field'}
5. 조명: soft natural window light, no studio lighting, no flash
6. 피부: natural skin with subtle laugh lines, healthy glow, NOT overly airbrushed, NOT wrinkle-free model skin, NOT old or tired looking — the skin of an active vibrant woman in her 40s
7. 품질: ${GENERATOR === 'chatgpt' || GENERATOR === 'dalle'
    ? 'photorealistic high resolution, natural detail, lifestyle photography, NOT AI art NOT CGI NOT stock photo, NOT blurry NOT soft focus'
    : 'film grain, Kodak Portra 400, lifestyle photography, NOT AI art NOT CGI NOT stock photo'}

비율별 추가 지시:
- 1:1 또는 9:16 (얼굴 클로즈업 비율): 프롬프트 앞부분에 반드시 추가 → "${GENERATOR === 'chatgpt' || GENERATOR === 'dalle' ? 'ONLY women present, no men, all-female scene, ' : ''}portrait of a stylish Korean woman in her late 40s, confident warm expression, dark hair, natural laugh lines at eye corners,"
- 16:9 (그룹/전신 비율): 프롬프트 앞부분에 → "${GENERATOR === 'chatgpt' || GENERATOR === 'dalle' ? 'ONLY women present, no men, all-female scene, ' : ''}group of stylish Korean women in their late 40s, urban chic casual style, confident and warm," 또는 단독샷이면 기본 7계층 그대로

욕망별 핵심 감성 (플래너가 프롬프트에 반드시 반영):
- RELATION: warm connection, sense of belonging, "I want to be there too" — genuine laughter and eye contact between friends
- HEALTH: light energetic vitality, "I want to live like that" — bright eyes, natural movement, outdoor freshness
- MONEY: calm reassurance, organized focus, "my life feels in order" — quiet concentration, serene domestic space
- RETIRE: exciting new beginning, intellectual curiosity, "second chapter of life ahead" — eager engaged expression, learning environment

결과물을 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이 순수 JSON만:
{
  "images": [
    {
      "filename": "욕망_장면_훅타입.png",
      "desire": "RELATION|RETIRE|MONEY|HEALTH",
      "hook": "감성훅|실용훅",
      "aspectRatio": "16:9",
      "quality": "hd",
      "prompt": "영어로 작성된 프롬프트",
      "description": "한국어 소재 설명 — 어떤 장면, 어떤 감정인지"
    }
  ],
  "summary": "전체 배치 한 줄 요약"
}`
}

// ─── 플래너: Claude → 이미지 스펙 JSON ────────────────────────────────────────

async function planImages(request: string): Promise<PlannerOutput> {
  const today = new Date().toISOString().slice(0, 10)

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 8192,
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

  const jsonMatch = raw.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`플래너 JSON 파싱 실패:\n${raw.text.slice(0, 500)}`)

  return JSON.parse(jsonMatch[0]) as PlannerOutput
}

// ─── Generator-Evaluator-Evolver 루프 ────────────────────────────────────────

export async function executeImageGeneration(
  spec: ImageSpec,
  outputDir: string
): Promise<GenerationResult> {
  console.log(`\n[Graphic Designer] 생성 시작: ${spec.filename}`)
  console.log(`  욕망: ${spec.desire} | 훅: ${spec.hook} | 비율: ${spec.aspectRatio}`)
  console.log(`  소재: ${spec.description}`)
  const generatorLabel =
    GENERATOR === 'gemini' ? 'Gemini (Playwright)' :
    GENERATOR === 'chatgpt' ? 'ChatGPT (Playwright)' : 'DALL-E 3'
  console.log(`  Generator: ${generatorLabel}`)

  let currentPrompt = spec.prompt
  const evolutionHistory: PromptEvolutionRecord[] = []
  let lastSavedPath = ''
  let lastCheckResult: BrandCheckResult | undefined

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n  ── 시도 ${attempt}/${MAX_ATTEMPTS} ──`)

    try {
      // 1. 이미지 생성 (Gemini / ChatGPT / DALL-E 3)
      let generated
      if (GENERATOR === 'gemini') {
        const results = await generateWithGemini(currentPrompt, spec.aspectRatio)
        generated = results[0]
      } else if (GENERATOR === 'chatgpt') {
        const results = await generateWithChatGPT(currentPrompt, spec.aspectRatio)
        generated = results[0]
      } else {
        const options: ImageGenerationOptions = {
          prompt: currentPrompt,
          aspectRatio: spec.aspectRatio,
          quality: spec.quality ?? 'hd',
        }
        const results = await generateImage(options)
        generated = results[0]
      }

      // 2. 파일 저장 (v2, v3는 별도 파일명)
      const baseFilename = spec.filename.replace('.png', '')
      const filename = attempt === 1 ? spec.filename : `${baseFilename}_v${attempt}.png`
      lastSavedPath = await saveGeneratedImage(generated, outputDir, filename)
      console.log(`  저장: ${path.basename(lastSavedPath)}`)

      // 3. Brand Guardian 검증
      let checkResult: BrandCheckResult | undefined
      try {
        checkResult = await checkBrandCompliance(lastSavedPath, spec.description)
        lastCheckResult = checkResult
        reportBrandCheck(checkResult, path.basename(lastSavedPath))
      } catch (err) {
        console.warn(`  ⚠️ 브랜드 검증 스킵:`, (err as Error).message)
        // 검증 실패 시 PASS로 간주하고 진행
        return {
          spec,
          savedPath: lastSavedPath,
          brandCheck: undefined,
          attempts: attempt,
          passed: true,
          evolutionHistory,
        }
      }

      // 4. 이력 기록
      evolutionHistory.push({
        attempt,
        prompt: currentPrompt,
        checkResult,
        passed: isBrandCheckPassed(checkResult),
        timestamp: new Date().toISOString(),
      })

      // 5. PASS 판정
      if (isBrandCheckPassed(checkResult)) {
        console.log(`  ✅ PASS (${attempt}회차 성공)`)

        // 진화 이력 sidecar 저장
        await saveEvolutionSidecar(lastSavedPath, evolutionHistory, {
          passed: true,
          attempts: attempt,
        })

        return {
          spec,
          savedPath: lastSavedPath,
          brandCheck: checkResult,
          attempts: attempt,
          passed: true,
          evolutionHistory,
        }
      }

      // 6. FAIL → 프롬프트 진화 (마지막 시도가 아닌 경우)
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ❌ FAIL → 프롬프트 진화 중...`)
        console.log(`     실패 원인: ${checkResult.failReasons.join(', ')}`)

        currentPrompt = await evolvePrompt({
          originalPrompt: currentPrompt,
          description: spec.description,
          checkResult,
          attemptNumber: attempt,
          history: evolutionHistory,
          generator: GENERATOR,
        })

        // 재시도 전 대기 (Gemini rate limit 방지)
        await new Promise((r) => setTimeout(r, GENERATOR !== 'dalle' ? 5_000 : 2_000))
      }
    } catch (err) {
      const errorMsg = (err as Error).message
      console.error(`  ❌ 생성 실패 (${attempt}회차):`, errorMsg)

      if (attempt === MAX_ATTEMPTS) {
        return {
          spec,
          savedPath: lastSavedPath,
          brandCheck: lastCheckResult,
          attempts: attempt,
          passed: false,
          evolutionHistory,
          error: errorMsg,
        }
      }
      // 일시적 오류면 재시도
      await new Promise((r) => setTimeout(r, 3_000))
    }
  }

  // 3회 모두 FAIL
  console.warn(`  ⚠️ ${MAX_ATTEMPTS}회 시도 후 FAIL — 수동 검토 필요`)

  await saveEvolutionSidecar(lastSavedPath, evolutionHistory, {
    passed: false,
    attempts: MAX_ATTEMPTS,
  })

  return {
    spec,
    savedPath: lastSavedPath,
    brandCheck: lastCheckResult,
    attempts: MAX_ATTEMPTS,
    passed: false,
    evolutionHistory,
    error: 'MAX_ATTEMPTS_EXCEEDED',
  }
}

// ─── 진화 이력 사이드카 저장 ──────────────────────────────────────────────────

async function saveEvolutionSidecar(
  imagePath: string,
  history: PromptEvolutionRecord[],
  finalResult: { passed: boolean; attempts: number }
): Promise<void> {
  if (!imagePath) return

  try {
    const historyText = formatEvolutionHistory(history, finalResult)
    const sidecarPath = imagePath.replace(/\.(png|jpg|jpeg)$/, '_evolution.txt')
    await fs.writeFile(sidecarPath, historyText, 'utf-8')

    // 검증 결과 JSON도 저장
    if (history.length > 0) {
      const lastRecord = history[history.length - 1]
      const checkPath = imagePath.replace(/\.(png|jpg|jpeg)$/, '_check.json')
      await fs.writeFile(checkPath, JSON.stringify(lastRecord.checkResult, null, 2), 'utf-8')
    }
  } catch (err) {
    console.warn('  사이드카 저장 실패:', (err as Error).message)
  }
}

// ─── Slack 결과 보고 ──────────────────────────────────────────────────────────

async function notifyResults(
  results: GenerationResult[],
  outputDir: string,
  summary: string
): Promise<void> {
  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = total - passed
  const avgAttempts = (results.reduce((s, r) => s + r.attempts, 0) / total).toFixed(1)

  const lines = [
    `*Graphic Designer 이미지 생성 완료*`,
    ``,
    `📊 결과: ${passed}/${total}장 PASS | 평균 시도: ${avgAttempts}회 | Generator: ${GENERATOR}`,
    `📁 저장: \`${outputDir.replace(PROJECT_ROOT, '')}\``,
    ``,
    `소재 요약: ${summary}`,
    ``,
    ...results.map((r) => {
      const brand = r.brandCheck
        ? r.passed
          ? `✅ PASS (${r.attempts}회차)`
          : `⚠️ FAIL — ${r.brandCheck.failReasons.slice(0, 2).join(', ')}`
        : '검증 스킵'
      return `${r.passed ? '✅' : '❌'} ${r.spec.filename} (${r.spec.desire}) — ${brand}`
    }),
    ...(failed > 0
      ? [``, `⚠️ FAIL ${failed}장: assets/review 폴더에서 _evolution.txt 확인 후 수동 검토`]
      : []),
  ]

  await sendSlackMessage('AGENT', lines.join('\n'))
}

// ─── 메인 에이전트 ────────────────────────────────────────────────────────────

export async function runGraphicDesigner(request: string): Promise<void> {
  console.log('[Graphic Designer] 요청:', request)
  const generatorDisplay =
    GENERATOR === 'gemini' ? 'Gemini (Playwright)' :
    GENERATOR === 'chatgpt' ? 'ChatGPT (Playwright)' : 'DALL-E 3'
  console.log(`[Graphic Designer] Generator: ${generatorDisplay}`)
  console.log('[Graphic Designer] Step 1: 이미지 스펙 계획 수립...')

  // 1. 플래너: Claude Haiku → ImageSpec[]
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
  console.log(`\n[Graphic Designer] Step 2: 이미지 생성 + 검증 루프 (${plan.images.length}장)...`)
  console.log(`저장 경로: ${outputDir}`)
  console.log(`최대 시도 횟수: ${MAX_ATTEMPTS}회/소재`)

  // 3. Generator-Evaluator-Evolver 루프 (순차 실행 — rate limit 고려)
  const results: GenerationResult[] = []
  for (const spec of plan.images) {
    const result = await executeImageGeneration(spec, outputDir)
    results.push(result)

    // 소재 간 대기 (DALL-E rate limit / Gemini·ChatGPT는 scraper 내부에서 이미 대기)
    const isLast = plan.images.indexOf(spec) === plan.images.length - 1
    if (!isLast && GENERATOR === 'dalle') {
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }

  // 4. 브라우저 정리 (Playwright 방식인 경우)
  if (GENERATOR === 'gemini') {
    await closeGeminiBrowser()
  } else if (GENERATOR === 'chatgpt') {
    await closeChatGPTBrowser()
  }

  // 5. 결과 요약
  const passedCount = results.filter((r) => r.passed).length
  const avgAttempts = (results.reduce((s, r) => s + r.attempts, 0) / results.length).toFixed(1)
  console.log(`\n[Graphic Designer] 완료: ${passedCount}/${results.length}장 PASS`)
  console.log(`평균 시도 횟수: ${avgAttempts}회`)
  console.log(`📁 리뷰 폴더: ${outputDir}`)

  // 6. Slack 알림
  await notifyResults(results, outputDir, plan.summary)
}

// ─── CLI 진입점 ────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? 'RELATION 욕망 소재 1개 테스트 (16:9)'
  runGraphicDesigner(request).catch((err) => {
    console.error('[Graphic Designer] 치명적 오류:', err)
    // 오류 발생 시에도 브라우저 정리
    const cleanup = GENERATOR === 'chatgpt' ? closeChatGPTBrowser() : closeGeminiBrowser()
    cleanup.finally(() => process.exit(1))
  })
}
