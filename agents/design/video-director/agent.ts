/**
 * Video Director Agent
 *
 * 역할: 우나어 광고/SNS 영상 자동 제작 오케스트레이터
 * - Script(Claude Opus) → Illustrate(Gemini Imagen 3 Pro) → TTS(Gemini 2.5 Flash)
 *   → Subtitle(Whisper) → Edit(FFmpeg) 파이프라인
 * - 16:9 + 9:16 동시 출력
 *
 * 실행: npx tsx agents/design/video-director/agent.ts "[요청]"
 * 예시: npx tsx agents/design/video-director/agent.ts "60초 광고 영상 - 인생 2막 커뮤니티"
 *
 * 의존:
 *   GEMINI_API_KEY  — Imagen 3 Pro + TTS
 *   OPENAI_API_KEY  — Whisper 자막
 *   ffmpeg-static   — npm install ffmpeg-static (agents/ 폴더)
 *
 * 비용 예상:
 *   Imagen 3 Pro $0.04 × 장면수 + TTS $0.10/1M chars + Whisper $0.006/분
 *   60초 영상 기준: ~$0.40 (6장면 이미지 + TTS + Whisper)
 *
 * // LOCAL ONLY — 바이너리 의존성 + 긴 실행 시간, GitHub Actions 불가
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { generateScript } from './skills/script.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import { illustrateAllScenes } from './skills/illustrate.js'
import { generateNarration } from './skills/tts.js'
import { generateSubtitles } from './skills/subtitle.js'
import { editVideo } from './skills/edit-video.js'

const PROJECT_ROOT = path.join(__dirname, '../../..')
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets/generated/video')

export interface VideoRequest {
  topic: string
  durationSeconds?: number
  style?: 'narration' | 'interview' | 'documentary'
  withBGM?: boolean
}

/**
 * 영상 제작 전체 파이프라인 실행
 */
export async function runVideoDirector(request: VideoRequest): Promise<void> {
  const topic = request.topic
  const durationSeconds = request.durationSeconds ?? 60
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeTopic = topic.slice(0, 20).replace(/[^a-zA-Z0-9가-힣]/g, '_')
  const outputDir = path.join(ASSETS_DIR, `${today}_${safeTopic}`)

  console.log(`[Video Director] 시작: ${topic} (${durationSeconds}초)`)
  console.log(`[Video Director] 출력: ${outputDir}`)

  // 1단계: 대본 생성 (Claude Opus)
  console.log('\n[1/5] 대본 생성 중...')
  const script = await generateScript({
    topic,
    durationSeconds,
    style: request.style,
  })
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    path.join(outputDir, 'script.json'),
    JSON.stringify(script, null, 2)
  )
  console.log(`[1/5] 완료: ${script.scenes.length}장면, 제목: ${script.title}`)

  // 2단계: 장면 이미지 생성 (Gemini Imagen 3 Pro)
  console.log('\n[2/5] 장면 이미지 생성 중...')
  const imagesDir = path.join(outputDir, 'images')
  const imagePaths = await illustrateAllScenes(script.scenes, imagesDir)
  console.log(`[2/5] 완료: ${imagePaths.length}개 이미지`)

  // 3단계: 나레이션 TTS (Gemini 2.5 Flash TTS)
  console.log('\n[3/5] 나레이션 생성 중...')
  const audioPath = await generateNarration({
    text: script.narrationText,
    outputDir,
    filename: 'narration.mp3',
  })
  console.log(`[3/5] 완료: ${audioPath}`)

  // 4단계: 자막 생성 (Whisper)
  console.log('\n[4/5] 자막 생성 중...')
  let srtPath: string | undefined
  try {
    srtPath = await generateSubtitles(audioPath, outputDir, 'subtitles.srt')
    console.log(`[4/5] 완료: ${srtPath}`)
  } catch (err) {
    console.warn(`[4/5] 자막 생성 실패 (건너뜀): ${err}`)
  }

  // 5단계: 영상 편집 (FFmpeg)
  console.log('\n[5/5] 영상 합성 중...')
  const { landscape, portrait } = await editVideo({
    scenes: script.scenes,
    imagePaths,
    audioPath,
    srtPath,
    outputDir,
    title: script.title,
  })

  console.log(`
[Video Director] 완료!
  제목: ${script.title}
  16:9: ${landscape}
  9:16: ${portrait}
  폴더: ${outputDir}
  `)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? '우나어 브랜드 소개 60초 영상'
  runVideoDirector({
    topic: request,
    durationSeconds: 60,
  }).catch(console.error)
}
