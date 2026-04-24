/**
 * Skill: Resize Asset
 * Sharp 라이브러리로 이미지 채널별 사이즈 변환
 *
 * npm install sharp (agents/ 폴더에서)
 *
 * // LOCAL ONLY — sharp 바이너리 의존성
 */

import * as fs from 'fs/promises'
import * as path from 'path'

export interface ResizeTarget {
  label: string
  width: number
  height: number
}

/** 채널별 사이즈 규격 */
export const RESIZE_TARGETS: ResizeTarget[] = [
  { label: 'google_banner_1200x628', width: 1200, height: 628 },
  { label: 'google_square_300x250', width: 300, height: 250 },
  { label: 'google_vertical_160x600', width: 160, height: 600 },
  { label: 'instagram_feed_1080x1080', width: 1080, height: 1080 },
  { label: 'instagram_story_1080x1920', width: 1080, height: 1920 },
  { label: 'facebook_ad_1200x628', width: 1200, height: 628 },
  { label: 'magazine_thumb_800x450', width: 800, height: 450 },
]

/**
 * 단일 이미지 → 특정 사이즈로 변환
 */
export async function resizeImage(
  inputPath: string,
  target: ResizeTarget,
  outputDir: string
): Promise<string> {
  // sharp는 런타임에 동적 import (npm install 안 된 환경 대비)
  let sharp: typeof import('sharp')
  try {
    sharp = (await import('sharp')).default as unknown as typeof import('sharp')
  } catch {
    throw new Error('sharp 미설치. agents/ 폴더에서 npm install sharp 실행 필요')
  }

  await fs.mkdir(outputDir, { recursive: true })
  const ext = path.extname(inputPath)
  const baseName = path.basename(inputPath, ext)
  const outputPath = path.join(outputDir, `${baseName}_${target.label}${ext}`)

  await (sharp as unknown as (input: string) => import('sharp').Sharp)(inputPath)
    .resize(target.width, target.height, {
      fit: 'cover',
      position: 'center',
    })
    .png()
    .toFile(outputPath)

  console.log(`[Resize] ${target.label} → ${outputPath}`)
  return outputPath
}

/**
 * 단일 이미지 → 전체 채널 사이즈 일괄 변환
 */
export async function resizeToAllChannels(
  inputPath: string,
  outputDir: string,
  targets: ResizeTarget[] = RESIZE_TARGETS
): Promise<string[]> {
  const paths: string[] = []
  for (const target of targets) {
    const outputPath = await resizeImage(inputPath, target, outputDir)
    paths.push(outputPath)
  }
  return paths
}
