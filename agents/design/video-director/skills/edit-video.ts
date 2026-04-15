/**
 * Skill: Edit Video
 * FFmpeg으로 이미지 + 오디오 + 자막 합성
 *
 * npm install ffmpeg-static (agents/ 폴더에서)
 *
 * // LOCAL ONLY — ffmpeg-static 바이너리 필요
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { SceneScript } from './script.js'

const execFileAsync = promisify(execFile)

/** ffmpeg-static 바이너리 경로 */
function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static') as string
  } catch {
    return 'ffmpeg' // 시스템 ffmpeg 폴백
  }
}

export interface EditOptions {
  scenes: SceneScript[]
  imagePaths: string[]     // scenes[i] → imagePaths[i]
  audioPath: string        // 전체 나레이션 MP3
  srtPath?: string         // SRT 자막 파일 (선택)
  bgmPath?: string         // 배경음악 (선택)
  outputDir: string
  title: string
}

/**
 * 장면별 이미지 슬라이드 + 오디오 + 자막 합성
 * 출력: 16:9 (1920x1080) + 9:16 (1080x1920) 동시 생성
 */
export async function editVideo(options: EditOptions): Promise<{ landscape: string; portrait: string }> {
  const ffmpeg = getFfmpegPath()
  const safeTitle = options.title.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')

  await fs.mkdir(options.outputDir, { recursive: true })

  // 1. 이미지 concat 리스트 파일 생성
  const concatListPath = path.join(options.outputDir, 'concat_list.txt')
  const concatLines = options.scenes.map((scene, i) => {
    const imgPath = options.imagePaths[i] ?? options.imagePaths[0]
    return `file '${imgPath}'\nduration ${scene.durationSeconds}`
  })
  // 마지막 이미지 중복 (ffmpeg concat 요구사항)
  concatLines.push(`file '${options.imagePaths[options.imagePaths.length - 1]}'`)
  await fs.writeFile(concatListPath, concatLines.join('\n'))

  // 2. 16:9 합성 (1920x1080)
  const outputLandscape = path.join(options.outputDir, `${safeTitle}_16x9.mp4`)
  await renderVideo({
    ffmpeg,
    concatListPath,
    audioPath: options.audioPath,
    srtPath: options.srtPath,
    bgmPath: options.bgmPath,
    outputPath: outputLandscape,
    width: 1920,
    height: 1080,
  })

  // 3. 9:16 합성 (1080x1920) — 이미지 크롭
  const outputPortrait = path.join(options.outputDir, `${safeTitle}_9x16.mp4`)
  await renderVideo({
    ffmpeg,
    concatListPath,
    audioPath: options.audioPath,
    srtPath: options.srtPath,
    bgmPath: options.bgmPath,
    outputPath: outputPortrait,
    width: 1080,
    height: 1920,
  })

  console.log(`[Edit] 완성:\n  16:9 → ${outputLandscape}\n  9:16 → ${outputPortrait}`)
  return { landscape: outputLandscape, portrait: outputPortrait }
}

interface RenderOptions {
  ffmpeg: string
  concatListPath: string
  audioPath: string
  srtPath?: string
  bgmPath?: string
  outputPath: string
  width: number
  height: number
}

async function renderVideo(opts: RenderOptions): Promise<void> {
  const args: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', opts.concatListPath,
    '-i', opts.audioPath,
  ]

  let filterComplex = `[0:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vscaled]`
  const mapVideo = '[vscaled]'

  // BGM 믹싱 (있으면)
  if (opts.bgmPath) {
    args.push('-i', opts.bgmPath)
    filterComplex += `;[2:a]volume=0.15[bgm];[1:a][bgm]amix=inputs=2:duration=first[aout]`
    args.push('-filter_complex', filterComplex)
    args.push('-map', mapVideo, '-map', '[aout]')
  } else {
    args.push('-filter_complex', filterComplex)
    args.push('-map', mapVideo, '-map', '1:a')
  }

  // 자막 번인 (있으면)
  if (opts.srtPath) {
    // 자막은 별도 필터 추가 (복잡성 회피를 위해 2-pass 방식은 미사용)
    args.push('-vf', `subtitles='${opts.srtPath}':force_style='FontName=Pretendard Variable,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2'`)
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-r', '30',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    opts.outputPath,
  )

  try {
    await execFileAsync(opts.ffmpeg, args)
  } catch (err) {
    throw new Error(`FFmpeg 렌더링 실패: ${err}`)
  }
}
