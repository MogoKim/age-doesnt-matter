/**
 * Brand Guardian
 * 생성된 이미지가 브랜드 가이드 준수 여부 검증
 * Claude Vision (claude-haiku-4-5)으로 컬러 팔레트 + 톤 자동 검증
 *
 * // LOCAL ONLY — 이미지 검증 API 비용 발생
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'

const client = new Anthropic()
// 검증은 저렴한 Haiku로 충분
const VISION_MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'

const BRAND_CHECK_PROMPT = `이 이미지가 우나어 브랜드 가이드를 준수하는지 검토해주세요.

브랜드 가이드:
- 메인 컬러: 코랄 #FF6F61 (포인트 요소에 사용)
- 분위기: 따뜻하고 친근함, 신뢰감, 활력
- 타겟: 50~60대 한국 여성
- 금지: 남성 인물, "시니어" 이미지(노쇠하거나 약한 느낌), 지나치게 젊은 모델
- 권장: 자연스러운 50대 전후 한국 여성, 따뜻한 조명, 일상 장면

다음 항목을 각각 평가하고 JSON으로만 응답하세요 (다른 텍스트 없이):
{
  "colorCheck": "PASS 또는 FAIL — 브랜드 컬러(코랄) 포인트 포함 여부",
  "ageTargetCheck": "PASS 또는 FAIL — 50~60대 여성 타겟 적합성",
  "brandToneCheck": "PASS 또는 FAIL — 따뜻함/신뢰감 톤",
  "aiArtifactLevel": "LOW 또는 MEDIUM 또는 HIGH — AI 생성 티 수준",
  "overallFit": "PASS 또는 FAIL — 전반적 브랜드 적합성",
  "notes": "짧은 피드백 (30자 이내)"
}`

export interface BrandCheckResult {
  colorCheck: 'PASS' | 'FAIL'
  ageTargetCheck: 'PASS' | 'FAIL'
  brandToneCheck: 'PASS' | 'FAIL'
  aiArtifactLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  overallFit: 'PASS' | 'FAIL'
  notes: string
}

/**
 * 이미지 파일 브랜드 검증 (Claude Vision)
 */
export async function checkBrandCompliance(imagePath: string): Promise<BrandCheckResult> {
  const imageBuffer = await fs.readFile(imagePath)
  const base64Image = imageBuffer.toString('base64')

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: BRAND_CHECK_PROMPT,
          },
        ],
      },
    ],
  })

  const raw = response.content[0]
  if (raw.type !== 'text') throw new Error('Brand Guardian: 응답 없음')

  const jsonMatch = raw.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Brand Guardian: JSON 파싱 실패\n${raw.text.slice(0, 300)}`)

  return JSON.parse(jsonMatch[0]) as BrandCheckResult
}

/**
 * 검증 결과 콘솔 출력
 */
export function reportBrandCheck(result: BrandCheckResult, imagePath: string): void {
  const status = result.overallFit === 'PASS' ? '✅' : '❌'
  console.log(`\n[Brand Guardian] ${status} ${imagePath}`)
  console.log(`  컬러: ${result.colorCheck} | 연령: ${result.ageTargetCheck} | 톤: ${result.brandToneCheck}`)
  console.log(`  AI 티: ${result.aiArtifactLevel} | 전반적: ${result.overallFit}`)
  console.log(`  ${result.notes}`)
}
