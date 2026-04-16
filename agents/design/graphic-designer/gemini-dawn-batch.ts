/**
 * Gemini Dawn Batch — 새벽 자동 실행
 *
 * 실행 순서: HEALTH (사이즈 3종) → MONEY_07 → RELATION (토큰 남으면)
 * 실행: set -a && source .env.local && set +a && IMAGE_GENERATOR=gemini npx tsx agents/design/graphic-designer/gemini-dawn-batch.ts
 *
 * // LOCAL ONLY — Playwright 이미지 생성, 크론 불필요
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { executeImageGeneration } from './agent.js'
import { closeGeminiBrowser } from './skills/gemini-scraper.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROJECT_ROOT = path.join(__dirname, '../../..')
const REVIEW_BASE = path.join(PROJECT_ROOT, 'assets/review')

interface ImageSpec {
  filename: string
  desire: string
  hook: string
  aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' | '9:16' | '4:5'
  quality: 'standard' | 'hd'
  prompt: string
  description: string
}

// ─── Gemini 전용 프롬프트 (f/1.4 bokeh 사용 가능) ─────────────────────────────

function geminiPrompt(scene: string, extra = ''): string {
  return [
    'portrait of a stylish Korean woman in her late 40s',
    `${scene}`,
    'naturally aged, similar look to Korean actress Jeon Do-yeon or Song Yoon-ah',
    'natural Korean facial features, warm confident authentic expression',
    'no heavy makeup, natural everyday appearance, visible laugh lines',
    'candid unposed authentic lifestyle moment',
    'shot on Canon EOS R5, 85mm f/1.4 portrait lens, soft background bokeh',
    'soft natural window light or outdoor daylight, no studio lighting',
    'natural skin texture, subtle aging details, healthy glow',
    'photorealistic high resolution lifestyle photography, NOT AI art NOT CGI NOT stock photo',
    'subtle warm coral #FF6F61 accent in scarf, cup, clothing or background detail',
    ...(extra ? [extra] : []),
  ].join(', ')
}

function geminiGroupPrompt(scene: string, extra = ''): string {
  return [
    'two Korean women in their late 40s to early 50s',
    `${scene}`,
    'similar natural look to Korean actresses like Jeon Do-yeon or Song Yoon-ah',
    'natural Korean facial features, warm genuine group interaction',
    'candid unposed group moment, authentic shared expressions',
    'shot on Canon EOS R5, 35mm lens, natural depth, soft bokeh background',
    'soft natural ambient cafe light, no studio lighting',
    'natural skin textures on both women, visible laugh lines',
    'photorealistic high resolution lifestyle documentary photography, NOT AI art NOT CGI',
    'subtle warm coral #FF6F61 accent in clothing, cups, or setting',
    ...(extra ? [extra] : []),
  ].join(', ')
}

// ─── 배치 스펙 ────────────────────────────────────────────────────────────────

// 욕망4 HEALTH — 사이즈 3종 × 2장 = 6장
const HEALTH_BATCH: ImageSpec[] = [
  {
    filename: 'HEALTH_09_park_smile_9x16.png',
    desire: 'HEALTH', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '공원 산책로, 자연광 클로즈업, 기분 좋게 웃음 (세로)',
    prompt: geminiPrompt(
      'walking on Korean neighborhood park path, face closeup or upper body, bright genuine smile, vibrant healthy energy, full of life',
      'Korean urban park — tree-lined path, soft natural golden daylight, spring greenery, light-green accent'
    ),
  },
  {
    filename: 'HEALTH_09_park_smile_1x1.png',
    desire: 'HEALTH', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '공원 산책로, 자연광 클로즈업, 기분 좋게 웃음 (정방형)',
    prompt: geminiPrompt(
      'closeup portrait on park path, warm genuine smile, healthy glowing skin, fresh outdoor energy',
      'Korean urban park — soft natural daylight, green bokeh background, light-green accent'
    ),
  },
  {
    filename: 'HEALTH_09_park_smile_4x5.png',
    desire: 'HEALTH', hook: '감성훅', aspectRatio: '4:5', quality: 'hd',
    description: '공원 산책로, 자연광 클로즈업, 기분 좋게 웃음 (4:5 피드)',
    prompt: geminiPrompt(
      'upper body portrait on park path, bright smile, healthy vibrant expression, relaxed outdoor posture',
      'Korean urban park — tree-lined walking path, soft natural daylight, spring atmosphere, light-green accent'
    ),
  },
  {
    filename: 'HEALTH_10_bench_memo_9x16.png',
    desire: 'HEALTH', hook: '실용훅', aspectRatio: '9:16', quality: 'hd',
    description: '공원 벤치, 폰 읽으며 수첩 메모 (세로)',
    prompt: geminiPrompt(
      'sitting on park bench, reading smartphone screen and writing in small notebook, focused and purposeful, calm outdoor concentration',
      'Korean park bench — dappled natural light through trees, outdoor fresh atmosphere, green surroundings, sage-green accent'
    ),
  },
  {
    filename: 'HEALTH_10_bench_memo_1x1.png',
    desire: 'HEALTH', hook: '실용훅', aspectRatio: '1:1', quality: 'hd',
    description: '공원 벤치, 폰 읽으며 수첩 메모 (정방형)',
    prompt: geminiPrompt(
      'sitting at park bench, smartphone in one hand, pen writing in notebook, natural focus and purpose',
      'Korean park — natural light, green background bokeh, outdoor atmosphere, sage-green accent'
    ),
  },
  {
    filename: 'HEALTH_10_bench_memo_4x5.png',
    desire: 'HEALTH', hook: '실용훅', aspectRatio: '4:5', quality: 'hd',
    description: '공원 벤치, 폰 읽으며 수첩 메모 (4:5 피드)',
    prompt: geminiPrompt(
      'upper body on park bench, phone in one hand and notebook in other, engaged in purposeful note-taking outdoors',
      'Korean park — dappled natural light, green surroundings, fresh outdoor atmosphere, sage-green accent'
    ),
  },
]

// 욕망3 MONEY — 실패한 MONEY_07만
const MONEY_BATCH: ImageSpec[] = [
  {
    filename: 'MONEY_07_sofa_relief_9x16.png',
    desire: 'MONEY', hook: '실용훅', aspectRatio: '9:16', quality: 'hd',
    description: '집 거실/소파에서 스마트폰 읽으며 안도하는 표정',
    prompt: geminiPrompt(
      'sitting on sofa in Korean apartment living room, holding smartphone and reading screen with subtle expression of relief and reassurance, calm settled feeling',
      'Korean apartment living room — clean minimal interior, soft natural morning light from window, cream-warm tones, comfortable home atmosphere'
    ),
  },
]

// 욕망1 RELATION — 실패한 3장 (토큰 남으면 실행)
const RELATION_BATCH: ImageSpec[] = [
  {
    filename: 'RELATION_01_cafe_laugh_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '카페 창가, 스마트폰 읽다 환하게 웃음',
    prompt: geminiPrompt(
      'sitting at cafe window seat, looking at smartphone screen, suddenly bursting into a genuine bright laugh, eyes crinkling with joy, phone in hand',
      'Korean cafe interior — wooden table, coffee cup, warm window light streaming in, cozy atmosphere'
    ),
  },
  {
    filename: 'RELATION_02_cafe_empathy_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '카페, 스마트폰 보다 눈가 촉촉 공감 순간',
    prompt: geminiPrompt(
      'sitting at cafe table, reading smartphone screen with deeply moved emotional expression, eyes glistening with tears of empathy, hand touching cheek gently',
      'Korean cafe interior — warm cozy atmosphere, soft window light, coffee on table'
    ),
  },
  {
    filename: 'RELATION_04_cafe_group_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '카페, 2명 여성이 함께 폰 보며 웃음',
    prompt: geminiGroupPrompt(
      'sitting together at cafe table, leaning in to look at one smartphone screen between them, sharing a genuine heartfelt laugh together, warm intimate connection',
      'Korean cafe interior — wooden table, coffee cups steaming, warm window light, cozy intimate atmosphere'
    ),
  },
]

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function runBatch(
  batch: ImageSpec[],
  outputDir: string,
  label: string
): Promise<{ passed: number; failed: number; tokenExhausted: boolean }> {
  let passed = 0
  let failed = 0

  for (let i = 0; i < batch.length; i++) {
    const spec = batch[i]
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`[${label}] ${i + 1}/${batch.length}: ${spec.filename}`)
    console.log(`${'═'.repeat(60)}`)

    try {
      const result = await executeImageGeneration(spec, outputDir)
      if (result.passed) passed++
      else failed++
    } catch (err) {
      const errStr = String(err)
      // Gemini 토큰 소진 감지
      if (
        errStr.includes('quota') ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('token')
      ) {
        console.error(`\n[Dawn Batch] ⚠️ Gemini 토큰 소진 감지 — 여기서 중단`)
        console.error(`[Dawn Batch] 미완료 소재: ${batch.slice(i).map((s) => s.filename).join(', ')}`)
        return { passed, failed, tokenExhausted: true }
      }
      console.error(`[Dawn Batch] ❌ ${spec.filename} 실패:`, err)
      failed++
    }
  }

  return { passed, failed, tokenExhausted: false }
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const outputDir = path.join(REVIEW_BASE, today)
  await fs.mkdir(outputDir, { recursive: true })

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[Dawn Batch] Gemini 새벽 배치 시작`)
  console.log(`[Dawn Batch] 출력 경로: ${outputDir}`)
  console.log(`[Dawn Batch] 순서: HEALTH(${HEALTH_BATCH.length}장) → MONEY(${MONEY_BATCH.length}장) → RELATION(${RELATION_BATCH.length}장)`)
  console.log(`${'═'.repeat(60)}\n`)

  let totalPassed = 0
  let totalFailed = 0

  // 1순위: HEALTH (사이즈 3종 × 2장)
  console.log(`\n[Dawn Batch] ▶ 욕망4 HEALTH 시작 (${HEALTH_BATCH.length}장)`)
  const healthResult = await runBatch(HEALTH_BATCH, outputDir, 'HEALTH')
  totalPassed += healthResult.passed
  totalFailed += healthResult.failed
  if (healthResult.tokenExhausted) {
    console.log(`[Dawn Batch] HEALTH 도중 토큰 소진. 종료.`)
    await closeGeminiBrowser()
    printSummary(totalPassed, totalFailed, outputDir)
    return
  }

  // 2순위: MONEY_07
  console.log(`\n[Dawn Batch] ▶ 욕망3 MONEY 시작 (${MONEY_BATCH.length}장)`)
  const moneyResult = await runBatch(MONEY_BATCH, outputDir, 'MONEY')
  totalPassed += moneyResult.passed
  totalFailed += moneyResult.failed
  if (moneyResult.tokenExhausted) {
    console.log(`[Dawn Batch] MONEY 도중 토큰 소진. 종료.`)
    await closeGeminiBrowser()
    printSummary(totalPassed, totalFailed, outputDir)
    return
  }

  // 3순위: RELATION (토큰 남으면)
  console.log(`\n[Dawn Batch] ▶ 욕망1 RELATION 시작 (${RELATION_BATCH.length}장)`)
  const relationResult = await runBatch(RELATION_BATCH, outputDir, 'RELATION')
  totalPassed += relationResult.passed
  totalFailed += relationResult.failed

  await closeGeminiBrowser()
  printSummary(totalPassed, totalFailed, outputDir)
}

function printSummary(passed: number, failed: number, outputDir: string): void {
  const total = passed + failed
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[Dawn Batch] 완료: ${passed}/${total}장 PASS | FAIL: ${failed}장`)
  console.log(`[Dawn Batch] 📁 리뷰 폴더: ${outputDir}`)
  console.log(`${'═'.repeat(60)}\n`)
}

main().catch((err) => {
  console.error('[Dawn Batch] 치명적 오류:', err)
  process.exit(1)
})
