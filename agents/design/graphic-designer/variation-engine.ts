/**
 * Variation Engine
 * 광고 소재 베리에이션 전체 파이프라인 오케스트레이터
 * 생성 → 브랜드 검증 → 리사이즈 → 결과 리포트
 *
 * 실행: npx tsx agents/design/graphic-designer/variation-engine.ts
 *
 * // LOCAL ONLY — Gemini Imagen API 비용 발생
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createVariationSet } from './skills/create-variation.js'
import { checkBrandCompliance, reportBrandCheck } from './brand-guardian.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROJECT_ROOT = path.join(__dirname, '../../..')
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets/generated/ads')

export interface CampaignSpec {
  campaign: string
  subject: string
  messages: [string, string, string]  // 정확히 3가지
  style?: 'photorealistic' | 'illustration'
  skipBrandCheck?: boolean
  /**
   * 설정 시 buildBrandPrompt() 대신 이 프롬프트를 직접 사용
   * buildKoreanWomanPrompt() 등 커스텀 빌더 결과물 전달용
   */
  rawSubjectPrompt?: string
}

/**
 * 캠페인 소재 전체 세트 생성
 * 3메시지 × 7채널 = 21개 이미지
 */
export async function runVariationEngine(spec: CampaignSpec): Promise<void> {
  console.log(`[Variation Engine] 캠페인: ${spec.campaign}`)
  console.log(`메시지 3종:`)
  spec.messages.forEach((m, i) => console.log(`  V${i + 1}: ${m}`))

  const results = await createVariationSet({
    campaign: spec.campaign,
    subject: spec.subject,
    messages: spec.messages,
    style: spec.style,
    outputDir: ASSETS_DIR,
    rawSubjectPrompt: spec.rawSubjectPrompt,
  })

  // 브랜드 검증 (마스터 이미지만)
  if (!spec.skipBrandCheck) {
    console.log('\n[Brand Check] 마스터 이미지 검증...')
    for (const result of results) {
      try {
        const check = await checkBrandCompliance(result.masterImagePath)
        reportBrandCheck(check, result.masterImagePath)
      } catch (err) {
        console.warn(`[Brand Check] 검증 실패 (건너뜀): ${err}`)
      }
    }
  }

  // 결과 요약
  console.log('\n[Variation Engine] 완료!')
  console.log(`생성된 소재:`)
  for (const result of results) {
    console.log(`\n  메시지: ${result.message}`)
    console.log(`  마스터: ${result.masterImagePath}`)
    console.log(`  채널별 (${result.resizedPaths.length}개):`)
    result.resizedPaths.forEach(p => console.log(`    - ${path.basename(p)}`))
  }

  // 결과 JSON 저장
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeCampaign = spec.campaign.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
  const reportPath = path.join(ASSETS_DIR, `${today}_${safeCampaign}`, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify({ spec, results }, null, 2))
  console.log(`\n리포트: ${reportPath}`)
}

// 예시 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  runVariationEngine({
    campaign: '5060_커뮤니티_봄시즌',
    subject: '50대 여성이 카페에서 친구들과 웃으며 스마트폰을 보고 있는 장면',
    messages: [
      '우리 또래가 선택한 커뮤니티',
      '우리, 서로가 있잖아',
      '지금 가입하고 우또래 만나기',
    ],
    style: 'photorealistic',
  }).catch(console.error)
}
