/**
 * Google Ads 에셋 업로더
 *
 * RSA 텍스트 에셋 업로드 및 이미지 에셋 업로드를 지원합니다.
 * 현재 운영 방식(RSA 검색광고)에서는 이미지 업로드 불필요.
 * 향후 GDN(디스플레이) 또는 PMax 전환 시 활성화.
 *
 * 사용:
 *   npx tsx agents/marketing/google-ads/lib/asset-uploader.ts --image assets/review/RELATION_01_cafe_laugh_9x16.png
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createGoogleAdsClient } from './google-ads-client.js'

// ──────────────────────────────────────────────────────────────
// 이미지 에셋 업로드 (GDN / PMax 전환 시 사용)
// ──────────────────────────────────────────────────────────────

export async function uploadImageAsset(imagePath: string, name: string): Promise<string> {
  const customer = await createGoogleAdsClient()
  const imageData = await fs.readFile(imagePath)
  const base64 = imageData.toString('base64')

  const result = await (customer as unknown as {
    assets: {
      create: (assets: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
    }
  }).assets.create([{
    name,
    type: 5,  // IMAGE
    image_asset: {
      data: base64,
    },
  }])

  const resourceName = result.results[0].resource_name
  console.log(`[asset-uploader] 이미지 업로드 완료: ${resourceName}`)
  return resourceName
}

// ──────────────────────────────────────────────────────────────
// 우나어 이미지 에셋 일괄 업로드
// (향후 GDN 캠페인 전환 시: assets/review/*.png 일괄 업로드)
// ──────────────────────────────────────────────────────────────

export async function uploadUnaoerAssets(assetsDir: string): Promise<Record<string, string>> {
  const files = await fs.readdir(assetsDir)
  const pngFiles = files.filter(f => f.endsWith('.png'))

  const uploaded: Record<string, string> = {}

  for (const file of pngFiles) {
    const filePath = path.join(assetsDir, file)
    const name = path.basename(file, '.png')

    console.log(`[asset-uploader] 업로드 중: ${file}`)
    try {
      const resourceName = await uploadImageAsset(filePath, name)
      uploaded[name] = resourceName
      // API 레이트 리밋 방지
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`[asset-uploader] 실패: ${file} —`, err)
    }
  }

  return uploaded
}

// ──────────────────────────────────────────────────────────────
// CLI 실행
// ──────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const imageFlag = args.indexOf('--image')

  if (imageFlag !== -1 && args[imageFlag + 1]) {
    const imagePath = args[imageFlag + 1]
    const name = path.basename(imagePath, path.extname(imagePath))
    uploadImageAsset(imagePath, name).catch(console.error)
  } else {
    console.log('사용법: npx tsx asset-uploader.ts --image <파일경로>')
    console.log('현재 RSA 운영 중 — 이미지 업로드는 GDN/PMax 전환 시 필요')
  }
}
