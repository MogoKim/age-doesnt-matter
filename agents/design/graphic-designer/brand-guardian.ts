/**
 * Brand Guardian
 * 생성된 이미지가 브랜드 가이드 준수 여부 검증
 * Gemini Vision API로 컬러 팔레트 + 톤 자동 검증
 *
 * // LOCAL ONLY — 이미지 검증 API 비용 발생
 */

import * as fs from 'fs/promises'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const BRAND_CHECK_PROMPT = `이 이미지가 우나어 브랜드 가이드를 준수하는지 검토해주세요.

브랜드 가이드:
- 메인 컬러: 코랄 #FF6F61 (포인트 요소에 사용)
- 분위기: 따뜻하고 친근함, 신뢰감, 활력
- 타겟: 50~60대 한국인
- 금지: "시니어" 이미지 (노쇠하거나 약한 느낌), 지나치게 젊은 모델
- 권장: 자연스러운 50~60대 모습, 따뜻한 조명

다음 항목을 각각 PASS/FAIL로 평가하고 이유를 짧게:
1. 브랜드 컬러 포함 여부
2. 타겟 연령대 적합성 (50~60대)
3. 브랜드 톤 (따뜻함/신뢰감)
4. AI 생성 티 수준 (낮을수록 좋음)
5. 전반적 브랜드 적합성

JSON으로 응답:
{
  "colorCheck": "PASS|FAIL",
  "ageTargetCheck": "PASS|FAIL",
  "brandToneCheck": "PASS|FAIL",
  "aiArtifactLevel": "LOW|MEDIUM|HIGH",
  "overallFit": "PASS|FAIL",
  "notes": "짧은 피드백"
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
 * 이미지 파일 브랜드 검증
 */
export async function checkBrandCompliance(imagePath: string): Promise<BrandCheckResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수 없음')

  const imageBuffer = await fs.readFile(imagePath)
  const base64Image = imageBuffer.toString('base64')

  const response = await fetch(
    `${GEMINI_API_BASE}/gemini-2.0-flash:generateContent`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image,
              },
            },
            { text: BRAND_CHECK_PROMPT },
          ],
        }],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Brand Guardian API 오류 ${response.status}: ${err}`)
  }

  const data = await response.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('브랜드 검증 응답 파싱 실패')

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
