/**
 * V2 Gemini Batch — 8장면 × 세로형(9:16) + 선택 4장면 × 정사각형(1:1) = 12장
 *
 * 개선 사항:
 * - 셀럽 직접 레퍼런스 제거 → 공통 vibe 묘사로 교체
 * - 나이대 앵커링 강화 (vibrant late 40s)
 * - 헤어 제한 강화 (dark hair, minimal gray)
 * - RETIRE 씬: 소품 디테일 추가 (책 제목, 강좌명 등)
 * - 출력: assets/review/20260412_v2/
 *
 * 실행: set -a && source .env.local && set +a && IMAGE_GENERATOR=gemini npx tsx agents/design/graphic-designer/v2-gemini-batch.ts
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
  aspectRatio: '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
  quality: 'standard' | 'hd'
  prompt: string
  description: string
}

// ─── Gemini 전용 프롬프트 빌더 (V2) ──────────────────────────────────────────

/**
 * 솔로 포트레이트 — 개선된 나이대/셀럽 vibe
 */
function geminiElegant(scene: string, extra = ''): string {
  return [
    'portrait of a stylish Korean woman in her late 40s',
    scene,
    'inspired by the natural refined elegance of acclaimed Korean actresses and entertainers born in the late 1960s to mid-1970s — confident warm poise and urban chicness — NOT resembling any specific individual',
    'vibrant and energetic for her age, appears younger than typical late 40s, healthy glowing complexion',
    'natural Korean facial features, warm confident authentic expression',
    'naturally styled dark brown to dark black hair, very minimal gray, modern flattering cut, well-maintained',
    'no heavy makeup, natural everyday appearance, visible subtle laugh lines at eyes',
    'candid unposed authentic lifestyle moment',
    'shot on Canon EOS R5, 85mm f/1.4 portrait lens, soft background bokeh',
    'soft natural window light or outdoor daylight, no studio lighting',
    'natural skin texture, subtle aging details, healthy glow, NOT airbrushed NOT plastic skin',
    'photorealistic high resolution lifestyle photography, NOT AI art NOT CGI NOT stock photo',
    'subtle warm coral #FF6F61 accent in scarf, cup, clothing or background detail',
    ...(extra ? [extra] : []),
  ].join(', ')
}

/**
 * 그룹샷 — 전원 dark hair 강제, 개선된 vibe
 */
function geminiElegantGroup(scene: string, groupSize = '3 to 5', extra = ''): string {
  return [
    `${groupSize} Korean women in their late 40s to early 50s`,
    scene,
    'ALL women have dark brown or dark black hair — absolutely NO gray hair, NO silver hair on anyone',
    'all women appear vibrant and stylish for their age, visually late 40s to early 50s',
    'inspired by the natural refined elegance of acclaimed Korean actresses born 1967-1976 — NOT resembling any specific individual, diverse yet equally sophisticated looks',
    'natural Korean facial features, warm genuine group interaction',
    'candid unposed group moment, authentic shared expressions, visible subtle laugh lines',
    'shot on Canon EOS R5, 35mm lens, natural depth, soft bokeh background',
    'soft natural ambient light, no studio lighting',
    'natural skin textures, subtle aging details, healthy glowing complexions',
    'photorealistic high resolution lifestyle documentary photography, NOT AI art NOT CGI NOT stock photo',
    'subtle warm coral #FF6F61 accent in clothing, cups, or setting',
    ...(extra ? [extra] : []),
  ].join(', ')
}

// ─── 배치 스펙 (12장) ────────────────────────────────────────────────────────

const BATCH: ImageSpec[] = [
  // ── 9:16 세로형 × 8장면 ──────────────────────────────────────────────────

  {
    filename: 'V2_VIDEO_CALL_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '집에서 노트북 화상통화, 환한 미소 (9:16)',
    prompt: geminiElegant(
      'sitting at home desk, looking at laptop screen showing a video call with friends, warm bright smile, eyes crinkling with joy, engaged in conversation',
      'modern Korean apartment interior — clean minimal decor, soft natural window light, comfortable home atmosphere, warm tones'
    ),
  },
  {
    filename: 'V2_CAFE_4_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '카페 4명 그룹 대화, 웃음 (9:16)',
    prompt: geminiElegantGroup(
      'sitting together at cafe table, warm lively conversation, coffee cups in hand, genuine shared laughter',
      'four',
      'Korean independent cafe interior — wooden table, coffee cups, warm natural window light, cozy intimate atmosphere, plants in background'
    ),
  },
  {
    filename: 'V2_CAFE_5_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '카페 5명 그룹 웃음 (9:16)',
    prompt: geminiElegantGroup(
      'gathered at cafe table, sharing a joyful moment together, genuine heartfelt laughter, warm group energy',
      'five',
      'Korean cafe — wooden table with coffee cups, warm natural light, cozy interior with plants and bookshelves'
    ),
  },
  {
    filename: 'V2_STUDY_SOLO_9x16.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '9:16', quality: 'hd',
    description: '서재 혼자 집중 공부, 인생2막 소품 (9:16)',
    prompt: geminiElegant(
      'sitting at tidy home study desk, focused and purposeful, reading or taking notes, calm confident expression of someone pursuing new learning',
      'neat home office desk — books on desk with Korean titles related to life planning: 인생 2막, 50대 공부법, 자기계발, notebook with handwritten notes, tea cup, soft natural window light, bookshelves in background'
    ),
  },
  {
    filename: 'V2_STUDY_GROUP6_9x16.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '9:16', quality: 'hd',
    description: '도서관 6명 함께 공부, 자격증·자기계발 소품 (9:16)',
    prompt: geminiElegantGroup(
      'sitting around a library or community center table together, studying, taking notes, sharing materials with engaged focused expressions',
      'six',
      'Korean public library or community learning center — large table with study books and notebooks, Korean license exam prep and self-development books for adults, pens, small highlighters, bright natural light from windows'
    ),
  },
  {
    filename: 'V2_CLASSROOM_9x16.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '강의실 수강, 인문학/문화센터 (9:16)',
    prompt: geminiElegantGroup(
      'sitting in classroom or cultural center lecture hall, attentively watching a lecture with bright engaged expressions, front row focus',
      'four to six',
      'Korean community center or cultural lecture hall — rows of seats with desks, chalkboard or whiteboard in background with Korean text: 인문학 강좌, 나를 위한 공부, 새로운 시작 — notebooks open, pens ready, warm engaged atmosphere'
    ),
  },
  {
    filename: 'V2_LIBRARY_BOOK_9x16.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '도서관 4명 책 (ALL dark hair — 흰머리 완전 제거) (9:16)',
    prompt: geminiElegantGroup(
      'sitting together at library table, holding and showing each other Korean books, discussing with warm engaged expressions, natural intellectual curiosity',
      'four',
      'Korean public library — bookshelves background, Korean books with visible titles: 국민연금 활용 가이드, 은퇴 후 자산 관리, 노후 준비, 인생 2막 — books open with notes, natural library lighting'
    ),
  },
  {
    filename: 'V2_HOME_GROUP_9x16.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '9:16', quality: 'hd',
    description: '거실 4명 노트북 함께 봄 (9:16)',
    prompt: geminiElegantGroup(
      'sitting together around a laptop in living room, looking at screen together, warm shared interest, natural comfortable home atmosphere',
      'four',
      'modern Korean apartment living room — clean minimal furniture, laptop on low table, warm natural light from large windows, cozy home interior, coffee mugs'
    ),
  },

  // ── 1:1 정사각형 × 4장면 ─────────────────────────────────────────────────

  {
    filename: 'V2_CAFE_4_1x1.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '카페 4명 그룹 대화 정사각형 (1:1)',
    prompt: geminiElegantGroup(
      'seated at cafe table, warm conversation and laughter, coffee cups in hand, close group shot',
      'four',
      'Korean cafe interior — wooden table, coffee cups, warm natural window light, cozy atmosphere'
    ),
  },
  {
    filename: 'V2_CAFE_5_1x1.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '카페 5명 그룹 정사각형 (1:1)',
    prompt: geminiElegantGroup(
      'gathered at cafe table, sharing joyful laughter together, warm close group energy',
      'five',
      'Korean cafe — coffee cups on wooden table, warm natural light, intimate cozy setting'
    ),
  },
  {
    filename: 'V2_STUDY_SOLO_1x1.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '1:1', quality: 'hd',
    description: '서재 솔로 정사각형 (1:1)',
    prompt: geminiElegant(
      'at home study desk, focused on book or notebook, calm purposeful expression',
      'tidy home office — 인생 2막 and 50대 공부법 books on desk, notebook, tea cup, natural window light'
    ),
  },
  {
    filename: 'V2_HOME_GROUP_1x1.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '거실 4명 노트북 정사각형 (1:1)',
    prompt: geminiElegantGroup(
      'gathered around laptop in Korean apartment living room, looking at screen together, warm natural smiles',
      'four',
      'modern Korean apartment — low table with laptop, warm natural light, cozy interior, coffee mugs'
    ),
  },
]

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outputDir = path.join(REVIEW_BASE, '20260412_v2')
  await fs.mkdir(outputDir, { recursive: true })

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[V2 Gemini Batch] 시작: ${BATCH.length}장 (9:16 × 8 + 1:1 × 4)`)
  console.log(`[V2 Gemini Batch] 출력: ${outputDir}`)
  console.log(`[V2 Gemini Batch] 개선: 셀럽 vibe 공통화 + dark hair 강제 + RETIRE 소품`)
  console.log(`${'═'.repeat(60)}\n`)

  let passed = 0
  let failed = 0

  for (let i = 0; i < BATCH.length; i++) {
    const spec = BATCH[i]
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`[V2 Gemini] ${i + 1}/${BATCH.length}: ${spec.filename}`)
    console.log(`${'─'.repeat(60)}`)

    try {
      const result = await executeImageGeneration(spec, outputDir)
      if (result.passed) passed++
      else failed++
    } catch (err) {
      const errStr = String(err)
      if (
        errStr.includes('quota') ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('token')
      ) {
        console.error(`\n[V2 Gemini] ⚠️ Gemini 토큰 소진 — 중단`)
        console.error(`[V2 Gemini] 미완료: ${BATCH.slice(i).map((s) => s.filename).join(', ')}`)
        break
      }
      console.error(`[V2 Gemini] ❌ ${spec.filename}:`, err)
      failed++
    }
  }

  await closeGeminiBrowser()

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[V2 Gemini] 완료: ${passed}/${passed + failed}장 PASS`)
  console.log(`[V2 Gemini] 📁 ${outputDir}`)
  console.log(`${'═'.repeat(60)}\n`)
}

main().catch((err) => {
  console.error('[V2 Gemini] 치명적 오류:', err)
  process.exit(1)
})
