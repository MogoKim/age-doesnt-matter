/**
 * V2 ChatGPT Batch — 8장면 × 가로형(16:9) + 선택 4장면 × 정사각형(1:1) = 12장
 *
 * 개선 사항:
 * - 셀럽 직접 레퍼런스 제거 → 공통 vibe 묘사로 교체
 * - 나이대 앵커링 강화 (vibrant late 40s)
 * - 헤어 제한 강화 (dark hair, minimal gray)
 * - RETIRE 씬: 소품 디테일 추가 (책 제목, 강좌명 등)
 * - ChatGPT 전용: f/5.6 sharp focus (bokeh/blur 방지)
 * - 출력: assets/review/20260412_v2/
 *
 * 실행: set -a && source .env.local && set +a && IMAGE_GENERATOR=chatgpt npx tsx agents/design/graphic-designer/v2-chatgpt-batch.ts
 *
 * // LOCAL ONLY — Playwright 이미지 생성, 크론 불필요
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { executeImageGeneration } from './agent.js'
import { closeChatGPTBrowser } from './skills/chatgpt-scraper.js'

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

// ─── ChatGPT/DALL-E 전용 프롬프트 빌더 (V2) ──────────────────────────────────

/**
 * 솔로 포트레이트 — f/5.6 sharp focus, NO bokeh
 */
function chatgptElegant(scene: string, extra = ''): string {
  return [
    'ONLY women present, no men, all-female scene',
    `portrait of a stylish Korean woman in her late 40s, ${scene}`,
    'inspired by the natural refined elegance of acclaimed Korean actresses and entertainers born in the late 1960s to mid-1970s — confident warm poise and urban chicness — NOT resembling any specific individual',
    'vibrant and energetic for her age, appears younger than typical late 40s, healthy glowing complexion',
    'natural Korean facial features, warm confident authentic expression',
    'naturally styled dark brown to dark black hair, very minimal gray, modern flattering cut, well-maintained',
    'no heavy makeup, natural everyday appearance, visible subtle laugh lines at eyes',
    'candid unposed authentic lifestyle moment, NOT posing for camera',
    'shot on Canon EOS R5, 85mm portrait lens, sharp crisp focus, f/5.6 deep depth of field, NO blur NO bokeh',
    'soft natural window light or outdoor daylight, no studio lighting, no flash',
    'natural skin texture, subtle aging details, healthy glow, NOT airbrushed NOT plastic skin',
    'photorealistic high resolution lifestyle photography, NOT AI art NOT CGI NOT stock photo, NOT blurry NOT soft focus',
    'subtle warm coral #FF6F61 accent in scarf, cup, clothing or background detail',
    ...(extra ? [extra] : []),
  ].join(', ')
}

/**
 * 그룹샷 — 전원 dark hair 강제, f/5.6 sharp focus
 */
function chatgptElegantGroup(scene: string, groupSize = '3 to 5', extra = ''): string {
  return [
    'ONLY women present, no men, all-female scene',
    `${groupSize} Korean women in their late 40s to early 50s, ${scene}`,
    'ALL women have dark brown or dark black hair — absolutely NO gray hair, NO silver hair on any person in the image',
    'all women appear vibrant and stylish for their age, visually late 40s to early 50s',
    'inspired by the natural refined elegance of acclaimed Korean actresses born 1967-1976 — NOT resembling any specific individual, diverse yet equally sophisticated looks',
    'natural Korean facial features, warm genuine group interaction',
    'candid unposed group moment, authentic expressions, visible subtle laugh lines',
    'shot on Canon EOS R5, 35mm portrait lens, sharp focus on all faces, f/5.6 deep depth of field, NO blur NO bokeh',
    'soft natural ambient light, no studio lighting, no flash',
    'natural skin textures, subtle aging details, healthy glowing complexions, NOT airbrushed',
    'photorealistic high resolution lifestyle documentary photography, NOT AI art NOT CGI NOT stock photo, NOT blurry',
    'subtle warm coral #FF6F61 accent in clothing, cups, or setting',
    ...(extra ? [extra] : []),
  ].join(', ')
}

// ─── 배치 스펙 (12장) ────────────────────────────────────────────────────────

const BATCH: ImageSpec[] = [
  // ── 16:9 가로형 × 8장면 ──────────────────────────────────────────────────

  {
    filename: 'V2_VIDEO_CALL_16x9.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '집에서 노트북 화상통화, 환한 미소 (16:9)',
    prompt: chatgptElegant(
      'sitting at home desk, looking at laptop screen showing a video call with friends, warm bright smile, eyes crinkling with joy, engaged in conversation',
      'modern Korean apartment interior — clean minimal decor, soft natural window light, comfortable home atmosphere, warm tones, laptop open on desk'
    ),
  },
  {
    filename: 'V2_CAFE_4_16x9.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '카페 4명 그룹 대화, 웃음 (16:9)',
    prompt: chatgptElegantGroup(
      'sitting together at cafe table, warm lively conversation, coffee cups in hand, genuine shared laughter',
      'four',
      'Korean independent cafe interior — wooden table, coffee cups, warm natural window light, cozy intimate atmosphere, plants in background'
    ),
  },
  {
    filename: 'V2_CAFE_5_16x9.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '카페 5명 그룹 웃음 (16:9)',
    prompt: chatgptElegantGroup(
      'gathered at cafe table, sharing a joyful moment together, genuine heartfelt laughter, warm group energy',
      'five',
      'Korean cafe — wooden table with coffee cups, warm natural light, cozy interior with plants and bookshelves'
    ),
  },
  {
    filename: 'V2_STUDY_SOLO_16x9.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '16:9', quality: 'hd',
    description: '서재 혼자 집중 공부, 인생2막 소품 (16:9)',
    prompt: chatgptElegant(
      'sitting at tidy home study desk, focused and purposeful, reading or taking notes, calm confident expression of someone pursuing new learning',
      'neat home office desk — books with Korean titles: 인생 2막, 50대 공부법, 자기계발, notebook with handwritten notes, tea cup, bookshelves visible, soft natural window light'
    ),
  },
  {
    filename: 'V2_STUDY_GROUP6_16x9.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '16:9', quality: 'hd',
    description: '도서관 6명 함께 공부, 자격증·자기계발 소품 (16:9)',
    prompt: chatgptElegantGroup(
      'sitting around a library or community center table together, studying, taking notes, sharing materials with engaged focused expressions',
      'six',
      'Korean public library or community learning center — large table with study books and notebooks, Korean license exam prep and self-development books for adults, pens, highlighters, bright natural light from windows'
    ),
  },
  {
    filename: 'V2_CLASSROOM_16x9.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '강의실 수강, 인문학/문화센터 (16:9)',
    prompt: chatgptElegantGroup(
      'sitting in classroom or cultural center lecture hall, attentively watching a lecture with bright engaged expressions, natural audience setting',
      'four to six',
      'Korean community center or cultural lecture hall — rows of seats with desks, chalkboard or whiteboard with Korean text: 인문학 강좌, 나를 위한 공부, 새로운 시작 — notebooks open, pens ready, warm engaged atmosphere'
    ),
  },
  {
    filename: 'V2_LIBRARY_BOOK_16x9.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '도서관 4명 책 (ALL dark hair — 흰머리 완전 제거) (16:9)',
    prompt: chatgptElegantGroup(
      'sitting together at library table, holding and showing each other Korean books, discussing with warm engaged expressions, natural intellectual curiosity',
      'four',
      'Korean public library — bookshelves background, Korean books with visible titles: 국민연금 활용 가이드, 은퇴 후 자산 관리, 노후 준비 가이드, 인생 2막 — books open with notes, natural library lighting'
    ),
  },
  {
    filename: 'V2_HOME_GROUP_16x9.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '16:9', quality: 'hd',
    description: '거실 4명 노트북 함께 봄 (16:9)',
    prompt: chatgptElegantGroup(
      'sitting together around a laptop in living room, looking at screen together, warm shared interest, natural comfortable home atmosphere',
      'four',
      'modern Korean apartment living room — clean minimal furniture, laptop on low table, warm natural light from large windows, cozy home interior, coffee mugs'
    ),
  },

  // ── 1:1 정사각형 × 4장면 ─────────────────────────────────────────────────

  {
    filename: 'V2_VIDEO_CALL_1x1.png',
    desire: 'RELATION', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '화상통화 정사각형 (1:1)',
    prompt: chatgptElegant(
      'at home desk with laptop showing video call, warm bright smile, eyes crinkling with joy',
      'modern Korean apartment — clean desk, laptop screen, natural window light, comfortable home'
    ),
  },
  {
    filename: 'V2_STUDY_GROUP6_1x1.png',
    desire: 'RETIRE', hook: '실용훅', aspectRatio: '1:1', quality: 'hd',
    description: '도서관 6명 공부 정사각형 (1:1)',
    prompt: chatgptElegantGroup(
      'around library table studying and sharing materials, engaged focused group',
      'six',
      'Korean library — study books, Korean self-development and license prep materials, notebooks, natural light'
    ),
  },
  {
    filename: 'V2_CLASSROOM_1x1.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '강의실 정사각형 (1:1)',
    prompt: chatgptElegantGroup(
      'in lecture hall, attentively watching, bright engaged expressions, front rows visible',
      'four to six',
      'Korean cultural center classroom — chalkboard with 인문학 강좌 or 나를 위한 공부, notebooks open, warm atmosphere'
    ),
  },
  {
    filename: 'V2_LIBRARY_BOOK_1x1.png',
    desire: 'RETIRE', hook: '감성훅', aspectRatio: '1:1', quality: 'hd',
    description: '도서관 4명 책 정사각형 (1:1)',
    prompt: chatgptElegantGroup(
      'at library table, holding and discussing Korean books together, warm intellectual energy',
      'four',
      'Korean library — books with titles: 국민연금 활용, 은퇴 후 자산 관리, 인생 2막 — bookshelves background, natural lighting'
    ),
  },
]

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outputDir = path.join(REVIEW_BASE, '20260412_v2')
  await fs.mkdir(outputDir, { recursive: true })

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[V2 ChatGPT Batch] 시작: ${BATCH.length}장 (16:9 × 8 + 1:1 × 4)`)
  console.log(`[V2 ChatGPT Batch] 출력: ${outputDir}`)
  console.log(`[V2 ChatGPT Batch] 개선: 셀럽 vibe 공통화 + dark hair 강제 + RETIRE 소품`)
  console.log(`${'═'.repeat(60)}\n`)

  let passed = 0
  let failed = 0

  for (let i = 0; i < BATCH.length; i++) {
    const spec = BATCH[i]
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`[V2 ChatGPT] ${i + 1}/${BATCH.length}: ${spec.filename}`)
    console.log(`${'─'.repeat(60)}`)

    try {
      const result = await executeImageGeneration(spec, outputDir)
      if (result.passed) passed++
      else failed++
    } catch (err) {
      console.error(`[V2 ChatGPT] ❌ ${spec.filename}:`, err)
      failed++
    }
  }

  await closeChatGPTBrowser()

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[V2 ChatGPT] 완료: ${passed}/${passed + failed}장 PASS`)
  console.log(`[V2 ChatGPT] 📁 ${outputDir}`)
  console.log(`${'═'.repeat(60)}\n`)
}

main().catch((err) => {
  console.error('[V2 ChatGPT] 치명적 오류:', err)
  process.exit(1)
})
