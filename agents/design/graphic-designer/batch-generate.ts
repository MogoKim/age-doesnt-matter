/**
 * Batch Generate — 광고 소재 10장 순차 생성
 *
 * ad-briefs 기획서 기반 10개 소재를 순서대로 생성.
 * 실행: set -a && source .env.local && set +a && IMAGE_GENERATOR=chatgpt npx tsx agents/design/graphic-designer/batch-generate.ts
 *
 * // LOCAL ONLY — Playwright 이미지 생성, 크론 불필요
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { executeImageGeneration } from './agent.js'
import { closeChatGPTBrowser } from './skills/chatgpt-scraper.js'
import { closeGeminiBrowser } from './skills/gemini-scraper.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROJECT_ROOT = path.join(__dirname, '../../..')
const REVIEW_BASE = path.join(PROJECT_ROOT, 'assets/review')
const GENERATOR = (process.env.IMAGE_GENERATOR ?? 'chatgpt') as 'gemini' | 'chatgpt' | 'dalle'
// BATCH_FILTER=RELATION_01,MONEY_07 처럼 쉼표로 지정하면 해당 소재만 재실행
const BATCH_FILTER = process.env.BATCH_FILTER?.split(',').map((s) => s.trim()) ?? null

// ─── 타입 (agent.ts와 동일) ────────────────────────────────────────────────────

interface ImageSpec {
  filename: string
  desire: string
  hook: string
  aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
  quality: 'standard' | 'hd'
  prompt: string
  description: string
}

// ─── ChatGPT/DALL-E 전용 프롬프트 헬퍼 ──────────────────────────────────────

/**
 * ChatGPT/DALL-E용 안전한 9:16 세로 프롬프트 생성
 * - f/1.4, bokeh, shallow depth of field 제거 → sharp focus 사용
 * - "ONLY women" 명시
 */
function chatgptPrompt(scene: string, extra = ''): string {
  return [
    'ONLY women present, no men, all-female scene',
    `portrait of a stylish Korean woman in her late 40s, ${scene}`,
    'naturally aged, similar look to Korean actress Jeon Do-yeon or Song Yoon-ah',
    'natural Korean facial features, warm confident expression',
    'no heavy makeup, natural everyday appearance',
    'candid unposed authentic moment, NOT posing for camera',
    'shot on Canon EOS R5, 85mm portrait lens, sharp crisp focus, f/5.6 deep depth of field, NO blur NO bokeh',
    'soft natural window light or outdoor daylight, no studio lighting, no flash',
    'natural skin texture, subtle laugh lines, healthy glow, NOT airbrushed NOT plastic skin',
    'photorealistic high resolution, natural detail, lifestyle photography, NOT AI art NOT CGI NOT stock photo, NOT blurry NOT soft focus',
    'subtle warm coral #FF6F61 accent in scarf, cup, clothing or background detail',
    ...(extra ? [extra] : []),
  ].join(', ')
}


// ─── 배치 스펙 — 기획서 소재 10종 ────────────────────────────────────────────

const BATCH: ImageSpec[] = [
  // ── RELATION 4종 ────────────────────────────────────────────────────────────
  {
    filename: 'RELATION_01_cafe_laugh.png',
    desire: 'RELATION',
    hook: '감성훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '카페 창가에서 스마트폰을 읽다 나도 모르게 환하게 웃음이 터진 순간',
    prompt: chatgptPrompt(
      'sitting at cafe window seat, looking at smartphone screen, warm genuine smile with eyes softly crinkling with joy, quiet delightful moment, phone held in both hands',
      'Korean cafe interior — wooden table, coffee cup, warm window light streaming in, cozy calm atmosphere'
    ),
  },
  {
    filename: 'RELATION_02_cafe_empathy.png',
    desire: 'RELATION',
    hook: '감성훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '카페에서 스마트폰 화면을 읽다 눈가가 촉촉해진 공감의 감동 순간',
    prompt: chatgptPrompt(
      'sitting at cafe table, reading smartphone screen with deeply moved gentle expression, soft warm smile with quiet emotion, hand resting gently near heart, still and serene pose',
      'Korean cafe interior — warm cozy atmosphere, soft window light, coffee on table'
    ),
  },
  {
    filename: 'RELATION_03_cafe_nod.png',
    desire: 'RELATION',
    hook: '실용훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '카페 또는 소파에서 스마트폰을 보며 고개를 끄덕이는 편안한 순간',
    prompt: chatgptPrompt(
      'sitting comfortably at cafe or on sofa, looking at smartphone with a calm nodding expression, quiet thoughtful moment of recognition and agreement',
      'warm cozy indoor setting — soft ambient light, relaxed comfortable atmosphere'
    ),
  },
  {
    filename: 'RELATION_04_cafe_group.png',
    desire: 'RELATION',
    hook: '감성훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '카페 테이블에서 2~3명 여성이 한 스마트폰 화면을 함께 보며 깔깔 웃는 친밀한 장면',
    prompt: chatgptPrompt(
      'sitting at cafe table with a friend visible beside her, both women looking at smartphone screen placed on table, gentle warm smiles, calm relaxed sitting posture, no movement, no gestures',
      'Korean cafe interior — wooden table, two coffee cups, warm window light from side, simple cozy atmosphere'
    ),
  },

  // ── RETIRE 2종 ────────────────────────────────────────────────────────────
  {
    filename: 'RETIRE_05_class_smile.png',
    desire: 'RETIRE',
    hook: '감성훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '문화센터/공방 강의실에서 새 노트와 펜을 앞에 두고 강의 시작을 기다리며 들뜬 미소를 짓는 순간',
    prompt: chatgptPrompt(
      'sitting in a Korean community center classroom or workshop, fresh notebook and pen on desk, excited anticipatory smile waiting for class to begin, eager and ready to learn',
      'Korean cultural center classroom — warm study atmosphere, desks with stationery, other students blur-visible in background, mint-sage color accent visible'
    ),
  },
  {
    filename: 'RETIRE_06_library_focus.png',
    desire: 'RETIRE',
    hook: '실용훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '도서관 또는 집 서재에서 노트북 화면을 들여다보며 진지하게 메모하고 있는 모습',
    prompt: chatgptPrompt(
      'sitting at library desk or home study, focused intently on laptop screen, writing serious notes in notebook, intellectual concentration and purposeful engagement',
      'Korean library or home study — bookshelves background, warm desk lamp, calm studious atmosphere, sage-green accent visible'
    ),
  },

  // ── MONEY 2종 ─────────────────────────────────────────────────────────────
  {
    filename: 'MONEY_07_sofa_relief.png',
    desire: 'MONEY',
    hook: '실용훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '집 거실/소파에서 스마트폰을 들고 화면을 읽으며 살짝 안도하는 표정',
    prompt: chatgptPrompt(
      'sitting upright on sofa in Korean apartment living room, looking toward window with calm relieved expression, hands resting in lap, no phone, peaceful still moment, relaxed natural posture, mostly dark brown hair with only minimal natural gray highlights',
      'Korean apartment living room — clean minimal interior, soft natural morning light from window, cream-warm tones, comfortable home atmosphere'
    ),
  },
  {
    filename: 'MONEY_08_desk_documents.png',
    desire: 'MONEY',
    hook: '실용훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '집 거실 테이블/서재 책상에서 서류·통장을 한 손에 들고 스마트폰 화면을 번갈아 보는 안도감 섞인 표정',
    prompt: chatgptPrompt(
      'sitting at living room table or study desk, holding financial documents or bankbook in one hand and smartphone in other hand, alternating gaze between them, expression of calm relief and financial reassurance',
      'Korean home interior — tidy desk, warm cream tones, soft natural light, organized documents visible, calm domestic setting'
    ),
  },

  // ── HEALTH 2종 ────────────────────────────────────────────────────────────
  {
    filename: 'HEALTH_09_park_smile.png',
    desire: 'HEALTH',
    hook: '감성훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '공원 산책로에서 야외 자연광 속 여성의 얼굴 클로즈업 또는 상반신, 기분 좋게 웃는 활기찬 표정',
    prompt: chatgptPrompt(
      'standing still on Korean neighborhood park path facing camera, calm bright smile, healthy radiant glow, serene outdoor energy, upper body portrait, relaxed natural posture',
      'Korean urban park — tree-lined walking path, soft natural daylight, ginkgo or cherry trees visible, spring or autumn, light-green color accent'
    ),
  },
  {
    filename: 'HEALTH_10_bench_memo.png',
    desire: 'HEALTH',
    hook: '실용훅',
    aspectRatio: '9:16',
    quality: 'hd',
    description: '공원 벤치/산책로 쉼터에서 스마트폰으로 읽으며 작은 수첩에 메모하는 집중하는 모습',
    prompt: chatgptPrompt(
      'sitting on park bench or outdoor rest area, reading smartphone screen and writing in small notebook, focused and purposeful, calm outdoor concentration',
      'Korean park bench — dappled natural light through trees, outdoor fresh atmosphere, green surroundings, light sage-green accent visible'
    ),
  },
]

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const outputDir = path.join(REVIEW_BASE, today)
  await fs.mkdir(outputDir, { recursive: true })

  const generatorLabel =
    GENERATOR === 'gemini' ? 'Gemini (Playwright)' :
    GENERATOR === 'chatgpt' ? 'ChatGPT (Playwright)' : 'DALL-E 3'

  console.log(`\n[Batch Generate] 광고 소재 ${BATCH.length}장 순차 생성`)
  console.log(`[Batch Generate] Generator: ${generatorLabel}`)
  console.log(`[Batch Generate] 출력 경로: ${outputDir}\n`)

  const activeBatch = BATCH_FILTER
    ? BATCH.filter((s) => BATCH_FILTER.some((f) => s.filename.startsWith(f)))
    : BATCH

  console.log(`[Batch Generate] 실행 대상: ${activeBatch.length}장${BATCH_FILTER ? ` (필터: ${BATCH_FILTER.join(', ')})` : ''}\n`)

  const results = []
  for (let i = 0; i < activeBatch.length; i++) {
    const spec = activeBatch[i]
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`[Batch Generate] 소재 ${i + 1}/${activeBatch.length}: ${spec.filename}`)
    console.log(`${'═'.repeat(60)}`)
    try {
      const result = await executeImageGeneration(spec, outputDir)
      results.push(result)
    } catch (err) {
      console.error(`[Batch Generate] ❌ ${spec.filename} 생성 실패:`, err)
      results.push({ spec, passed: false, error: String(err), attempts: 3 })
    }
  }

  // 브라우저 종료
  if (GENERATOR === 'chatgpt') await closeChatGPTBrowser()
  else if (GENERATOR === 'gemini') await closeGeminiBrowser()

  // 최종 결과 요약
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[Batch Generate] 완료: ${passed}/${results.length}장 PASS | FAIL: ${failed}장`)
  console.log(`[Batch Generate] 📁 리뷰 폴더: ${outputDir}`)
  console.log(`${'═'.repeat(60)}\n`)

  if (failed > 0) {
    console.log('[Batch Generate] FAIL 목록:')
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.spec?.filename ?? '(unknown)'}: ${r.error ?? 'Brand Guardian FAIL'}`))
  }
}

main().catch((err) => {
  console.error('[Batch Generate] 치명적 오류:', err)
  process.exit(1)
})
