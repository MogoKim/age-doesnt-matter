/**
 * Skill: Create Variation
 * 메시지 베리에이션별 이미지 생성 오케스트레이터
 *
 * // LOCAL ONLY — Gemini Imagen API 비용 발생
 */

import * as path from 'path'
import { generateImage, saveGeneratedImage, buildBrandPrompt } from './generate-image.js'
import { resizeToAllChannels } from './resize-asset.js'

export interface VariationSet {
  campaign: string
  subject: string
  messages: string[]  // 3가지 메시지 베리에이션
  style?: 'photorealistic' | 'illustration'
  outputDir: string
  /**
   * 설정 시 buildBrandPrompt() 대신 이 프롬프트를 직접 사용
   * buildKoreanWomanPrompt() 등 커스텀 빌더 결과물 전달용
   * 메시지 텍스트는 자동으로 뒤에 append됨
   */
  rawSubjectPrompt?: string
}

export interface VariationResult {
  message: string
  masterImagePath: string
  resizedPaths: string[]
}

/**
 * 메시지 베리에이션 3종 × 채널별 사이즈 = 전체 소재 세트 생성
 */
export async function createVariationSet(
  options: VariationSet
): Promise<VariationResult[]> {
  const results: VariationResult[] = []
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeCampaign = options.campaign.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')

  for (let i = 0; i < options.messages.length; i++) {
    const message = options.messages[i]
    const variantDir = path.join(options.outputDir, `${today}_${safeCampaign}`, `v${i + 1}`)

    console.log(`[Variation] ${i + 1}/${options.messages.length}: ${message}`)

    // 마스터 이미지 생성 (16:9 기준)
    // rawSubjectPrompt가 있으면 커스텀 프롬프트 직접 사용 (buildBrandPrompt 우회)
    const prompt = options.rawSubjectPrompt
      ? `${options.rawSubjectPrompt}, ${message}`
      : buildBrandPrompt({
          subject: options.subject,
          message,
          style: options.style ?? 'photorealistic',
        })

    const images = await generateImage({
      prompt,
      aspectRatio: '16:9',
      model: 'imagen-4.0-generate-001',
      count: 1,
    })

    const masterFilename = `master_v${i + 1}.png`
    const masterPath = await saveGeneratedImage(images[0], variantDir, masterFilename)

    // 전체 채널 사이즈 리사이즈
    const resizedPaths = await resizeToAllChannels(masterPath, variantDir)

    results.push({
      message,
      masterImagePath: masterPath,
      resizedPaths,
    })

    // API 레이트 리밋 방지
    if (i < options.messages.length - 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return results
}
