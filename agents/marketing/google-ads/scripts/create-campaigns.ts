/**
 * 구글 애즈 3개 캠페인 일괄 생성 (One-shot)
 *
 * 사용법:
 *   dry-run (검증만): npx tsx agents/marketing/google-ads/scripts/create-campaigns.ts --dry-run
 *   실제 생성:        npx tsx agents/marketing/google-ads/scripts/create-campaigns.ts
 *
 * 사전 조건:
 *   - .env.local에 Google Ads API 환경변수 5개 설정 완료
 *   - cd agents && npm install google-ads-api
 *
 * 비용 영향: Google Ads API 호출 자체는 무료
 *            생성된 캠페인은 PAUSED 상태로 시작 → 수동 활성화 필요
 *
 * // DISPATCH ONLY — 캠페인 최초 생성용 일회성 스크립트, 크론 불필요
 */

import { createCampaign } from '../lib/campaign-creator.js'
import { RELATION_CAMPAIGN } from '../campaigns/relation-campaign.js'
import { HEALTH_CAMPAIGN } from '../campaigns/health-campaign.js'
import { RETIRE_MONEY_CAMPAIGN } from '../campaigns/retire-money-campaign.js'

const CAMPAIGNS = [RELATION_CAMPAIGN, HEALTH_CAMPAIGN, RETIRE_MONEY_CAMPAIGN]

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  console.log('='.repeat(60))
  console.log('우나어 구글 애즈 캠페인 생성기')
  console.log('='.repeat(60))

  if (dryRun) {
    console.log('\n[모드] DRY RUN — 설정 검증만 (API 호출 없음)\n')
  } else {
    console.log('\n[모드] 실제 생성 — 구글 애즈 계정에 캠페인이 생성됩니다\n')
    console.log('⚠️  생성된 캠페인은 PAUSED 상태입니다.')
    console.log('   구글 애즈 대시보드에서 확인 후 직접 활성화하세요.\n')
  }

  const results = []
  const errors = []

  for (const config of CAMPAIGNS) {
    try {
      const result = await createCampaign(config, dryRun)
      results.push(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n❌ ${config.name} 생성 실패: ${msg}`)
      errors.push({ name: config.name, error: msg })
    }
  }

  // ── 결과 요약 ──
  console.log('\n' + '='.repeat(60))
  console.log('생성 결과 요약')
  console.log('='.repeat(60))

  for (const r of results) {
    console.log(`\n✅ ${r.campaignName}`)
    console.log(`   욕망 코드: ${r.desireCode}`)
    console.log(`   키워드: ${r.keywordCount}개`)
    if (!dryRun) {
      console.log(`   캠페인: ${r.campaignResourceName}`)
      console.log(`   광고:   ${r.adResourceName}`)
    }
  }

  if (errors.length > 0) {
    console.log('\n실패:')
    for (const e of errors) {
      console.log(`  ❌ ${e.name}: ${e.error}`)
    }
  }

  console.log('\n' + '='.repeat(60))

  if (!dryRun && results.length > 0) {
    console.log('\n다음 단계:')
    console.log('  1. 구글 애즈 대시보드 접속 → 캠페인 목록 확인')
    console.log('  2. 각 캠페인 광고 미리보기 → 헤드라인/설명문 확인')
    console.log('  3. 캠페인 활성화 (PAUSED → ENABLED)')
    console.log('  4. 구글 애즈 → 도구 → 스크립트 → google-ads-script.js 등록')
  }

  if (errors.length > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[create-campaigns] 치명적 오류:', err)
  process.exit(1)
})
