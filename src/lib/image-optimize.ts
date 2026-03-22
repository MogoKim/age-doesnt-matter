import sharp from 'sharp'

const MAX_WIDTH = 1200
const MAX_HEIGHT = 1200
const QUALITY = 80

interface OptimizeResult {
  buffer: Buffer
  contentType: string
  width: number
  height: number
}

/**
 * 이미지를 WebP로 변환 + 리사이즈
 * - 최대 1200x1200
 * - WebP 80% 품질
 * - EXIF 메타데이터 제거
 */
export async function optimizeImage(input: Buffer): Promise<OptimizeResult> {
  const image = sharp(input).rotate() // EXIF orientation 자동 보정

  const metadata = await image.metadata()
  const width = metadata.width ?? MAX_WIDTH
  const height = metadata.height ?? MAX_HEIGHT

  const needsResize = width > MAX_WIDTH || height > MAX_HEIGHT

  const pipeline = needsResize
    ? image.resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    : image

  const output = await pipeline
    .withMetadata({ orientation: undefined })
    .webp({ quality: QUALITY })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: output.data,
    contentType: 'image/webp',
    width: output.info.width,
    height: output.info.height,
  }
}

/**
 * 썸네일 생성 (400x400 정사각형 crop)
 */
export async function createThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .withMetadata({ orientation: undefined })
    .webp({ quality: 70 })
    .toBuffer()
}
