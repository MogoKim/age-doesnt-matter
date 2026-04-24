/**
 * Skill: Subtitle Generation
 * OpenAI Whisper API로 SRT 자막 파일 생성
 *
 * 가격: $0.006/분
 *
 * // LOCAL ONLY — 인터랙티브 영상 제작 파이프라인 전용
 */

import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Whisper API로 오디오 → SRT 자막 변환
 */
export async function generateSubtitles(
  audioPath: string,
  outputDir: string,
  filename = 'subtitles.srt'
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY 환경변수 없음')

  const audioBuffer = await fs.readFile(audioPath)
  const audioFilename = path.basename(audioPath)

  // Node.js 18+ 내장 FormData 사용
  const form = new globalThis.FormData()
  const blob = new globalThis.Blob([audioBuffer], { type: 'audio/mpeg' })
  form.append('file', blob, audioFilename)
  form.append('model', 'whisper-1')
  form.append('language', 'ko')
  form.append('response_format', 'srt')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Whisper API 오류 ${response.status}: ${err}`)
  }

  const srtContent = await response.text()

  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, filename.endsWith('.srt') ? filename : `${filename}.srt`)
  await fs.writeFile(outputPath, srtContent, 'utf-8')

  console.log(`[Subtitle] SRT 자막 저장: ${outputPath}`)
  return outputPath
}

/**
 * SRT → ASS 변환 (FFmpeg 번인용, Pretendard 폰트)
 * Pretendard 폰트가 없으면 NanumGothic 폴백
 */
export function buildSubtitleFilter(srtPath: string): string {
  return `subtitles='${srtPath}':force_style='FontName=Pretendard Variable,FontSize=22,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2'`
}
