/**
 * Skill: Text-to-Speech
 * Gemini 2.5 Flash TTS로 한국어 나레이션 생성
 *
 * 가격: $0.10/1M chars
 * 참조: https://ai.google.dev/api/generate-content#v1beta.models.streamGenerateContent
 *
 * // LOCAL ONLY — 인터랙티브 영상 제작 파이프라인 전용
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const GEMINI_TTS_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'

export interface TTSOptions {
  text: string
  voiceName?: string  // 기본: Aoede (따뜻한 여성 목소리)
  outputDir: string
  filename?: string
}

/**
 * Gemini TTS로 나레이션 MP3 생성
 */
export async function generateNarration(options: TTSOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수 없음')

  const voiceName = options.voiceName ?? 'Aoede'
  const filename = options.filename ?? 'narration.mp3'

  const response = await fetch(
    `${GEMINI_TTS_BASE}/${TTS_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: options.text }],
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini TTS 오류 ${response.status}: ${err}`)
  }

  const data = await response.json() as {
    candidates?: Array<{
      content: {
        parts: Array<{ inlineData?: { mimeType: string; data: string } }>
      }
    }>
  }

  const audioPart = data.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!audioPart) throw new Error('TTS 오디오 데이터 없음')

  await fs.mkdir(options.outputDir, { recursive: true })
  const outputPath = path.join(options.outputDir, filename.endsWith('.mp3') ? filename : `${filename}.mp3`)
  await fs.writeFile(outputPath, Buffer.from(audioPart.data, 'base64'))

  console.log(`[TTS] 나레이션 저장: ${outputPath}`)
  return outputPath
}
