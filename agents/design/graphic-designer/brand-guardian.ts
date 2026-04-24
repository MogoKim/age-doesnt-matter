/**
 * Brand Guardian
 * 생성된 이미지가 브랜드 가이드 준수 여부 검증
 * Claude Vision (claude-haiku-4-5)으로 10항목 자동 검증
 * failReasons[] → prompt-evolver에서 프롬프트 진화에 활용
 *
 * // LOCAL ONLY — 이미지 검증 API 비용 발생
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'
import sharp from 'sharp'

const client = new Anthropic()
const VISION_MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'

// ─── 검증 프롬프트 빌더 ───────────────────────────────────────────────────────

function buildCheckPrompt(sceneDescription?: string): string {
  const sceneContext = sceneDescription
    ? `\n\n이미지가 표현해야 하는 장면 설명 (sceneMatch 검증 기준):\n"${sceneDescription}"`
    : ''

  return `이 이미지가 우나어 광고 소재 기준을 충족하는지 아래 10개 항목을 각각 평가하세요.${sceneContext}

브랜드 가이드:
- 타겟: 한국 여성, 외모 기준 40대 후반 (자연스러운 눈가 잔주름, 따뜻하고 자신감 있는 표정, 세련되고 도시적인 분위기)
- 금지: 남성 인물, 흰머리/새치 10% 이상 → ageTargetCheck FAIL, 할머니·노인 이미지, 스튜디오 배경지, AI 완벽피부
- 헤어: 검정 또는 짙은 갈색 위주 (새치 극소량만 허용, 전체의 10% 미만). 흰머리가 전체의 10% 이상이면 ageTargetCheck FAIL
- 권장: 자연스러운 눈가 잔주름·생기, 세련된 도시 캐주얼 의상 (어두운 톤 단색 또는 단정한 패턴), 자연광, 캔디드 분위기

다음 10개 항목을 평가하고 JSON으로만 응답하세요 (다른 텍스트 없이):
{
  "colorCheck": "PASS 또는 FAIL — 코랄 #FF6F61 계열 포인트 요소 존재 여부",
  "ageTargetCheck": "PASS 또는 FAIL — 40대 후반 외모로 적절한가 (너무 젊거나 늙지 않음, 흰머리/새치가 전체의 10% 이상이면 FAIL)",
  "brandToneCheck": "PASS 또는 FAIL — 따뜻함·신뢰감 분위기",
  "aiArtifactLevel": "LOW 또는 MEDIUM 또는 HIGH — AI 생성 티 수준 (피부 완벽함, 과도한 대칭 등)",
  "overallFit": "PASS 또는 FAIL — 전반적 광고 소재 적합성",
  "genderCheck": "PASS 또는 FAIL — 남성 인물이 없는가",
  "clothingCheck": "PASS 또는 FAIL — 자연스러운 한국 일상복 (병원복·스포츠복·무대의상 금지)",
  "sceneMatch": "PASS 또는 FAIL — 이미지 감정/장면이 소재 설명과 일치하는가 (sceneDescription 없으면 PASS)",
  "naturalLighting": "PASS 또는 FAIL — 자연광 기반 (스튜디오 조명·강한 플래시 금지)",
  "failReasons": ["실패한 항목들의 구체적 원인 — 예: '모델이 20대로 보임', '피부가 지나치게 매끄러움'"],
  "notes": "전체 피드백 요약 (50자 이내)"
}`
}

// ─── 검증 결과 타입 ───────────────────────────────────────────────────────────

export interface BrandCheckResult {
  // 기존 5항목
  colorCheck: 'PASS' | 'FAIL'
  ageTargetCheck: 'PASS' | 'FAIL'
  brandToneCheck: 'PASS' | 'FAIL'
  aiArtifactLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  overallFit: 'PASS' | 'FAIL'
  // 신규 5항목
  genderCheck: 'PASS' | 'FAIL'        // 남성 인물 없음
  clothingCheck: 'PASS' | 'FAIL'      // 자연스러운 일상복
  sceneMatch: 'PASS' | 'FAIL'         // 장면 설명과 감정 일치
  naturalLighting: 'PASS' | 'FAIL'    // 자연광 기반
  failReasons: string[]               // 실패 원인 목록 → prompt-evolver 입력
  notes: string
}

/**
 * Generator-Evaluator-Evolver 루프의 PASS 판정 기준
 * colorCheck는 Gemini가 일관성 없으므로 필수에서 제외
 */
export function isBrandCheckPassed(result: BrandCheckResult): boolean {
  return (
    result.overallFit === 'PASS' &&
    result.aiArtifactLevel !== 'HIGH' &&
    result.genderCheck === 'PASS' &&
    result.ageTargetCheck === 'PASS'
  )
}

// ─── 메인: 이미지 파일 브랜드 검증 ──────────────────────────────────────────

/**
 * 이미지 파일 브랜드 검증 (Claude Vision)
 * @param imagePath - 검증할 이미지 파일 경로
 * @param sceneDescription - 한국어 소재 설명 (sceneMatch 검증에 사용)
 */
export async function checkBrandCompliance(
  imagePath: string,
  sceneDescription?: string
): Promise<BrandCheckResult> {
  let imageBuffer = await fs.readFile(imagePath)

  // Claude Vision API 5MB 한도 초과 시 리사이즈 (Gemini는 고해상도 반환)
  const MAX_BYTES = 4.5 * 1024 * 1024
  if (imageBuffer.byteLength > MAX_BYTES) {
    imageBuffer = await sharp(imageBuffer)
      .resize({ width: 1536, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
    console.log(`  [Brand Guardian] 이미지 리사이즈: ${(imageBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`)
  }

  const base64Image = imageBuffer.toString('base64')

  // magic bytes로 실제 포맷 판별 (확장자는 틀릴 수 있음)
  // JPEG: FF D8 FF / PNG: 89 50 4E 47 / WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  const mediaType: 'image/jpeg' | 'image/png' | 'image/webp' =
    imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8
      ? 'image/jpeg'
      : imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45
        ? 'image/webp'
        : 'image/png'

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: buildCheckPrompt(sceneDescription),
          },
        ],
      },
    ],
  })

  const raw = response.content[0]
  if (raw.type !== 'text') throw new Error('Brand Guardian: 응답 없음')

  const jsonMatch = raw.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Brand Guardian: JSON 파싱 실패\n${raw.text.slice(0, 300)}`)

  const parsed = JSON.parse(jsonMatch[0]) as Partial<BrandCheckResult>

  // 신규 항목 기본값 보정 (구버전 응답 호환)
  return {
    colorCheck: parsed.colorCheck ?? 'FAIL',
    ageTargetCheck: parsed.ageTargetCheck ?? 'FAIL',
    brandToneCheck: parsed.brandToneCheck ?? 'FAIL',
    aiArtifactLevel: parsed.aiArtifactLevel ?? 'HIGH',
    overallFit: parsed.overallFit ?? 'FAIL',
    genderCheck: parsed.genderCheck ?? 'PASS',
    clothingCheck: parsed.clothingCheck ?? 'PASS',
    sceneMatch: parsed.sceneMatch ?? 'PASS',
    naturalLighting: parsed.naturalLighting ?? 'PASS',
    failReasons: Array.isArray(parsed.failReasons) ? parsed.failReasons : [],
    notes: parsed.notes ?? '',
  }
}

// ─── 결과 콘솔 출력 ───────────────────────────────────────────────────────────

export function reportBrandCheck(result: BrandCheckResult, imagePath: string): void {
  const passed = isBrandCheckPassed(result)
  const status = passed ? '✅' : '❌'
  console.log(`\n[Brand Guardian] ${status} ${imagePath}`)
  console.log(
    `  컬러: ${result.colorCheck} | 연령: ${result.ageTargetCheck} | 톤: ${result.brandToneCheck} | 성별: ${result.genderCheck}`
  )
  console.log(
    `  의상: ${result.clothingCheck} | 조명: ${result.naturalLighting} | 장면: ${result.sceneMatch}`
  )
  console.log(`  AI티: ${result.aiArtifactLevel} | 종합: ${result.overallFit}`)
  if (result.failReasons.length > 0) {
    console.log(`  실패 원인: ${result.failReasons.join(', ')}`)
  }
  console.log(`  ${result.notes}`)
}
