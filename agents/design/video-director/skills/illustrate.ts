/**
 * Skill: Illustrate Scenes
 * Gemini Imagen 3 Pro로 장면 이미지 생성
 *
 * 가격: $0.04/장 (Imagen 3 Pro)
 *
 * // LOCAL ONLY — 인터랙티브 영상 제작 파이프라인 전용
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { SceneScript } from './script.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const BRAND_VISUAL_SUFFIX = `
Korean adults in their 50s-60s, warm and natural lighting, candid lifestyle photography,
warm coral accent tones (#FF6F61), approachable and trustworthy atmosphere,
photorealistic, NOT AI art, natural imperfections, f/2.8 aperture, golden hour lighting`

/**
 * 단일 장면 이미지 생성
 */
export async function illustrateScene(
  scene: SceneScript,
  outputDir: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수 없음')

  const fullPrompt = `${scene.visualDescription}, ${BRAND_VISUAL_SUFFIX}`

  const response = await fetch(
    `${GEMINI_API_BASE}/imagen-3.0-generate-001:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{
          prompt: fullPrompt,
        }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Imagen API 오류 ${response.status}: ${err}`)
  }

  const data = await response.json() as {
    predictions?: Array<{ bytesBase64Encoded: string }>
  }

  const imageData = data.predictions?.[0]?.bytesBase64Encoded
  if (!imageData) throw new Error(`장면 ${scene.index} 이미지 생성 결과 없음`)

  await fs.mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `scene_${String(scene.index).padStart(2, '0')}.png`)
  await fs.writeFile(filePath, Buffer.from(imageData, 'base64'))

  console.log(`[Illustrate] 장면 ${scene.index} 저장: ${filePath}`)
  return filePath
}

/**
 * 모든 장면 이미지 생성 (순차 실행 — API 속도 제한 고려)
 */
export async function illustrateAllScenes(
  scenes: SceneScript[],
  outputDir: string
): Promise<string[]> {
  const paths: string[] = []
  for (const scene of scenes) {
    const filePath = await illustrateScene(scene, outputDir)
    paths.push(filePath)
    // API 레이트 리밋 방지: 장면 간 1초 대기
    await new Promise(r => setTimeout(r, 1000))
  }
  return paths
}
