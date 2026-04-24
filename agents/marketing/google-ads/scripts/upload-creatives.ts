/**
 * 우나어 광고 소재 이미지 업로드 (One-shot)
 *
 * RETIRE_MONEY + RELATION 캠페인 PNG 소재를 Google Ads 이미지 에셋으로 업로드.
 * 향후 GDN(디스플레이) 또는 PMax 캠페인 전환 시 사용.
 *
 * 사용법:
 *   npx tsx agents/marketing/google-ads/scripts/upload-creatives.ts --dry-run
 *   npx tsx agents/marketing/google-ads/scripts/upload-creatives.ts
 *
 * // DISPATCH ONLY — 최초 1회 수동 실행, 크론 불필요
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { uploadImageAsset } from '../lib/asset-uploader.js'

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../')

// 업로드할 소재 목록 (경로: 프로젝트 루트 기준)
const CREATIVES = [
  // RETIRE_MONEY 9:16
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/9x16_1_E_1080.png', name: 'retire_money_9x16_1_E' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/9x16_2_E_1080.png', name: 'retire_money_9x16_2_E' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/9x16_3_E_1080.png', name: 'retire_money_9x16_3_E' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/9x16_1_G_1080.png', name: 'retire_money_9x16_1_G' },
  // RETIRE_MONEY 16:9
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_1_H_1200.png', name: 'retire_money_16x9_1_H' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_1_J_1200.png', name: 'retire_money_16x9_1_J' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_2_H_1200.png', name: 'retire_money_16x9_2_H' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_2_J_1200.png', name: 'retire_money_16x9_2_J' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_3_H_1200.png', name: 'retire_money_16x9_3_H' },
  { file: 'assets/campaigns/RETIRE_MONEY/ad-creatives/16x9_3_J_1200.png', name: 'retire_money_16x9_3_J' },
  // RELATION 9:16
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_1번_E안_중앙대형텍스트_1080.png', name: 'relation_9x16_1_E' },
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_2번_E안_중앙대형텍스트_1080.png', name: 'relation_9x16_2_E' },
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_3번_E안_중앙대형텍스트_1080.png', name: 'relation_9x16_3_E' },
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_1번_G안_상하단분리_1080.png', name: 'relation_9x16_1_G' },
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_2번_G안_상하단분리_1080.png', name: 'relation_9x16_2_G' },
  { file: 'assets/campaigns/RELATION/ad-creatives/9x16_3번_G안_상하단분리_1080.png', name: 'relation_9x16_3_G' },
]

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  console.log('='.repeat(60))
  console.log('우나어 광고 소재 업로드')
  console.log('='.repeat(60))

  if (dryRun) {
    console.log('\n[모드] DRY RUN — 파일 존재 여부만 확인\n')
  } else {
    console.log('\n[모드] 실제 업로드 — Google Ads 이미지 에셋으로 등록\n')
  }

  const results: Record<string, string> = {}
  const errors: { name: string; error: string }[] = []

  for (const creative of CREATIVES) {
    const absPath = path.join(PROJECT_ROOT, creative.file)

    if (dryRun) {
      try {
        await fs.access(absPath)
        console.log(`  ✅ ${creative.name} — 파일 존재`)
      } catch {
        console.error(`  ❌ ${creative.name} — 파일 없음: ${absPath}`)
        errors.push({ name: creative.name, error: '파일 없음' })
      }
      continue
    }

    try {
      console.log(`  업로드 중: ${creative.name}`)
      const resourceName = await uploadImageAsset(absPath, creative.name)
      results[creative.name] = resourceName
      console.log(`  ✅ ${creative.name} → ${resourceName}`)
      // API 레이트 리밋 방지
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ❌ ${creative.name} 실패: ${msg}`)
      errors.push({ name: creative.name, error: msg })
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`완료: ${Object.keys(results).length}개 성공, ${errors.length}개 실패`)

  if (!dryRun && Object.keys(results).length > 0) {
    console.log('\n업로드된 에셋 resource_name:')
    for (const [name, rn] of Object.entries(results)) {
      console.log(`  ${name}: ${rn}`)
    }
    console.log('\n다음 단계: Google Ads 콘솔 → 도구 → 에셋 라이브러리 → 이미지에서 확인')
  }

  if (errors.length > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[upload-creatives] 치명적 오류:', err)
  process.exit(1)
})
