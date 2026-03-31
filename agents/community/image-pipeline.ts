/**
 * 이미지 파이프라인 — 외부 이미지 다운로드 → R2 업로드 → URL 교체
 * 엑박 방지 핵심 모듈
 */

import sharp from 'sharp'
import { uploadToR2 } from '../../src/lib/r2.js'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MIN_IMAGE_DIMENSION = 50 // px — 이모티콘/아이콘 필터

/** 이미지 처리 결과 */
interface ImageResult {
  originalUrl: string
  r2Url: string | null // null이면 실패
  error?: string
}

/**
 * HTML 내 이미지를 R2로 업로드하고 URL 교체
 * @returns { html, thumbnailUrl, imageCount }
 */
export async function processContentImages(
  html: string,
  sourceUrl: string,
  postKey: string,
): Promise<{ html: string; thumbnailUrl: string | null; imageCount: number }> {
  // <img> 태그에서 src 추출
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  const matches: Array<{ fullMatch: string; src: string }> = []

  let match
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push({ fullMatch: match[0], src: match[1] })
  }

  if (matches.length === 0) {
    return { html, thumbnailUrl: null, imageCount: 0 }
  }

  // 필터링: data URI, 트래킹 픽셀, 작은 아이콘 제외
  const validImages = matches.filter(({ src }) => {
    if (src.startsWith('data:')) return false
    if (src.includes('pixel') || src.includes('tracking') || src.includes('beacon')) return false
    if (src.includes('icon') && src.includes('btn_')) return false
    // 확장자 없는 트래킹 URL
    if (src.includes('/stat') || src.includes('/log')) return false
    return true
  })

  const results: ImageResult[] = []
  let thumbnailUrl: string | null = null
  const referer = new URL(sourceUrl).origin

  for (let i = 0; i < validImages.length; i++) {
    const { src } = validImages[i]
    try {
      const result = await downloadAndUpload(src, referer, postKey, i)
      results.push(result)

      if (result.r2Url && !thumbnailUrl) {
        thumbnailUrl = result.r2Url
      }
    } catch (err) {
      console.warn(`[image-pipeline] 이미지 처리 실패: ${src}`, err)
      results.push({ originalUrl: src, r2Url: null, error: String(err) })
    }
  }

  // HTML 내 URL 교체
  let processedHtml = html
  for (const result of results) {
    if (result.r2Url) {
      processedHtml = processedHtml.replaceAll(result.originalUrl, result.r2Url)
    } else {
      // 실패한 이미지 태그 제거
      const imgTag = validImages.find((m) => m.src === result.originalUrl)
      if (imgTag) {
        processedHtml = processedHtml.replace(imgTag.fullMatch, '')
      }
    }
  }

  const imageCount = results.filter((r) => r.r2Url).length

  return { html: processedHtml, thumbnailUrl, imageCount }
}

/**
 * 개별 이미지 다운로드 → 변환 → R2 업로드
 */
async function downloadAndUpload(
  imageUrl: string,
  referer: string,
  postKey: string,
  index: number,
): Promise<ImageResult> {
  // 상대 URL 처리
  const absoluteUrl = imageUrl.startsWith('http') ? imageUrl : `${referer}${imageUrl}`

  // 다운로드 (Referer 설정으로 hotlink 보호 우회)
  const response = await fetch(absoluteUrl, {
    headers: {
      Referer: referer,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    return { originalUrl: imageUrl, r2Url: null, error: `HTTP ${response.status}` }
  }

  const contentType = response.headers.get('content-type') ?? ''
  const buffer = Buffer.from(await response.arrayBuffer())

  // 크기 체크
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { originalUrl: imageUrl, r2Url: null, error: '이미지 크기 초과 (5MB)' }
  }

  // 빈 이미지 체크
  if (buffer.length < 100) {
    return { originalUrl: imageUrl, r2Url: null, error: '빈 이미지' }
  }

  const isGif = contentType.includes('gif') || imageUrl.toLowerCase().endsWith('.gif')

  let uploadBuffer: Buffer
  let uploadContentType: string
  let ext: string

  if (isGif) {
    // GIF는 원본 유지 (애니메이션 보존)
    uploadBuffer = buffer
    uploadContentType = 'image/gif'
    ext = 'gif'
  } else {
    // 나머지는 WebP 변환
    try {
      const metadata = await sharp(buffer).metadata()

      // 너무 작은 이미지 (아이콘) 필터
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width < MIN_IMAGE_DIMENSION || metadata.height < MIN_IMAGE_DIMENSION)
      ) {
        return { originalUrl: imageUrl, r2Url: null, error: '이미지 너무 작음 (아이콘)' }
      }

      uploadBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer()
      uploadContentType = 'image/webp'
      ext = 'webp'
    } catch {
      // sharp 변환 실패 시 원본 업로드
      uploadBuffer = buffer
      uploadContentType = contentType || 'image/jpeg'
      ext = contentType.includes('png') ? 'png' : 'jpg'
    }
  }

  const key = `scraped/${postKey}/${index}.${ext}`
  const { url } = await uploadToR2(uploadBuffer, key, uploadContentType)

  return { originalUrl: imageUrl, r2Url: url }
}
