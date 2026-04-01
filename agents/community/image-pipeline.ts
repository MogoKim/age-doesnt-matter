/**
 * 미디어 파이프라인 — 외부 이미지/동영상 다운로드 → R2 업로드 → URL 교체
 * 엑박/CSP 차단 방지 핵심 모듈
 *
 * 처리 대상:
 * - <img> 태그 → WebP 변환 후 R2 업로드
 * - <video>/<source> 태그 → mp4 그대로 R2 업로드
 * - GIF → 원본 유지 (애니메이션 보존)
 */

import sharp from 'sharp'
import { createRequire } from 'module'

// ESM(agents/)에서 CJS(src/lib/) 모듈 import — named export 호환
const require = createRequire(import.meta.url)
const { uploadToR2 } = require('../../src/lib/r2.ts') as {
  uploadToR2: (buffer: Buffer, key: string, contentType: string) => Promise<{ key: string; url: string }>
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_VIDEO_SIZE = 20 * 1024 * 1024 // 20MB
const MIN_IMAGE_DIMENSION = 50 // px — 이모티콘/아이콘 필터

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

/** 미디어 처리 결과 */
interface MediaResult {
  originalUrl: string
  r2Url: string | null // null이면 실패
  error?: string
}

// ── URL 해석 ──

/** protocol-relative(//), 절대(/), 상대 URL → https:// 절대 URL */
function resolveUrl(src: string, referer: string): string {
  if (src.startsWith('http')) return src
  if (src.startsWith('//')) return `https:${src}`
  if (src.startsWith('/')) return `${referer}${src}`
  return `${referer}/${src}`
}

// ── 이미지 필터링 ──

function isTrackingOrIcon(src: string): boolean {
  if (src.startsWith('data:')) return true
  if (src.includes('pixel') || src.includes('tracking') || src.includes('beacon')) return true
  if (src.includes('icon') && src.includes('btn_')) return true
  // 레벨 아이콘 (펨코 등급 뱃지)
  if (src.includes('/modules/point/icons')) return true
  // 확장자 없는 트래킹 URL
  if (src.includes('/stat') || src.includes('/log')) return true
  return false
}

// ── 공통 다운로드 ──

async function fetchMedia(
  url: string,
  referer: string,
  timeoutMs = 15000,
): Promise<{ buffer: Buffer; contentType: string } | { error: string }> {
  try {
    const response = await fetch(url, {
      headers: { Referer: referer, ...FETCH_HEADERS },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }

    const contentType = response.headers.get('content-type') ?? ''
    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length < 100) {
      return { error: '빈 파일' }
    }

    return { buffer, contentType }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 이미지 처리 ──

async function downloadAndUploadImage(
  imageUrl: string,
  referer: string,
  postKey: string,
  index: number,
): Promise<MediaResult> {
  const absoluteUrl = resolveUrl(imageUrl, referer)

  const result = await fetchMedia(absoluteUrl, referer)
  if ('error' in result) {
    return { originalUrl: imageUrl, r2Url: null, error: result.error }
  }

  const { buffer, contentType } = result

  if (buffer.length > MAX_IMAGE_SIZE) {
    return { originalUrl: imageUrl, r2Url: null, error: '이미지 크기 초과 (5MB)' }
  }

  const isGif = contentType.includes('gif') || imageUrl.toLowerCase().endsWith('.gif')

  let uploadBuffer: Buffer
  let uploadContentType: string
  let ext: string

  if (isGif) {
    uploadBuffer = buffer
    uploadContentType = 'image/gif'
    ext = 'gif'
  } else {
    try {
      const metadata = await sharp(buffer).metadata()

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
      uploadBuffer = buffer
      uploadContentType = contentType || 'image/jpeg'
      ext = contentType.includes('png') ? 'png' : 'jpg'
    }
  }

  const key = `scraped/${postKey}/${index}.${ext}`
  const { url } = await uploadToR2(uploadBuffer, key, uploadContentType)
  return { originalUrl: imageUrl, r2Url: url }
}

// ── 비디오 처리 ──

async function downloadAndUploadVideo(
  videoUrl: string,
  referer: string,
  postKey: string,
  index: number,
): Promise<MediaResult> {
  const absoluteUrl = resolveUrl(videoUrl, referer)

  const result = await fetchMedia(absoluteUrl, referer, 30000) // 비디오는 30초 타임아웃
  if ('error' in result) {
    return { originalUrl: videoUrl, r2Url: null, error: result.error }
  }

  const { buffer, contentType } = result

  if (buffer.length > MAX_VIDEO_SIZE) {
    return { originalUrl: videoUrl, r2Url: null, error: `동영상 크기 초과 (${Math.round(buffer.length / 1024 / 1024)}MB > 20MB)` }
  }

  const ext = contentType.includes('webm') ? 'webm' : 'mp4'
  const uploadContentType = contentType.includes('webm') ? 'video/webm' : 'video/mp4'

  const key = `scraped/${postKey}/v${index}.${ext}`
  const { url } = await uploadToR2(buffer, key, uploadContentType)
  return { originalUrl: videoUrl, r2Url: url }
}

// ── 메인: 이미지 + 비디오 통합 처리 ──

/**
 * HTML 내 이미지와 비디오를 R2로 업로드하고 URL 교체
 * @returns { html, thumbnailUrl, imageCount, videoCount }
 */
export async function processContentMedia(
  html: string,
  sourceUrl: string,
  postKey: string,
): Promise<{ html: string; thumbnailUrl: string | null; imageCount: number; videoCount: number }> {
  const referer = new URL(sourceUrl).origin
  let processedHtml = html
  let thumbnailUrl: string | null = null
  let imageCount = 0
  let videoCount = 0

  // ── 1. 이미지 처리 ──
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  const imgMatches: Array<{ fullMatch: string; src: string }> = []

  let match
  while ((match = imgRegex.exec(html)) !== null) {
    imgMatches.push({ fullMatch: match[0], src: match[1] })
  }

  const validImages = imgMatches.filter(({ src }) => !isTrackingOrIcon(src))

  for (let i = 0; i < validImages.length; i++) {
    const { src, fullMatch } = validImages[i]
    try {
      const result = await downloadAndUploadImage(src, referer, postKey, i)

      if (result.r2Url) {
        processedHtml = processedHtml.replaceAll(src, result.r2Url)
        imageCount++
        if (!thumbnailUrl) thumbnailUrl = result.r2Url
      } else {
        // 실패 시: 플레이스홀더로 교체 (태그 완전 삭제 X)
        console.warn(`[media-pipeline] 이미지 실패: ${src} — ${result.error}`)
        const placeholder = '<div class="image-placeholder">이미지를 불러올 수 없습니다</div>'
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    } catch (err) {
      console.warn(`[media-pipeline] 이미지 예외: ${src}`, err)
      const placeholder = '<div class="image-placeholder">이미지를 불러올 수 없습니다</div>'
      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }
  }

  // ── 2. 비디오 처리 ──
  // <video> 태그에서 src 추출 (video src 또는 내부 source src)
  const videoTagRegex = /<video[^>]*>[\s\S]*?<\/video>|<video[^>]*\/>/gi
  const videoMatches: Array<{ fullMatch: string; src: string }> = []

  while ((match = videoTagRegex.exec(processedHtml)) !== null) {
    const videoHtml = match[0]
    // <video src="..."> 패턴
    const videoSrcMatch = videoHtml.match(/<video[^>]+src=["']([^"']+)["']/i)
    // <source src="..."> 패턴
    const sourceSrcMatch = videoHtml.match(/<source[^>]+src=["']([^"']+)["']/i)
    const src = videoSrcMatch?.[1] || sourceSrcMatch?.[1]
    if (src) {
      videoMatches.push({ fullMatch: videoHtml, src })
    }
  }

  for (let i = 0; i < videoMatches.length; i++) {
    const { src, fullMatch } = videoMatches[i]
    try {
      const result = await downloadAndUploadVideo(src, referer, postKey, i)

      if (result.r2Url) {
        // 비디오 태그를 R2 URL로 재구성 (controls 자동 추가)
        const newVideoTag = `<video src="${result.r2Url}" controls preload="metadata" class="post-video"></video>`
        processedHtml = processedHtml.replace(fullMatch, newVideoTag)
        videoCount++
      } else {
        console.warn(`[media-pipeline] 비디오 실패: ${src} — ${result.error}`)
        const placeholder = '<div class="image-placeholder">동영상을 불러올 수 없습니다</div>'
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    } catch (err) {
      console.warn(`[media-pipeline] 비디오 예외: ${src}`, err)
      const placeholder = '<div class="image-placeholder">동영상을 불러올 수 없습니다</div>'
      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }
  }

  // ── 3. 정리: 빈 <a> wrapper 제거 ──
  processedHtml = processedHtml.replace(/<a[^>]*>\s*<\/a>/gi, '')

  return { html: processedHtml, thumbnailUrl, imageCount, videoCount }
}

/**
 * 하위 호환: 기존 processContentImages 호출을 지원
 * @deprecated processContentMedia 사용 권장
 */
export async function processContentImages(
  html: string,
  sourceUrl: string,
  postKey: string,
): Promise<{ html: string; thumbnailUrl: string | null; imageCount: number }> {
  const result = await processContentMedia(html, sourceUrl, postKey)
  return { html: result.html, thumbnailUrl: result.thumbnailUrl, imageCount: result.imageCount }
}
