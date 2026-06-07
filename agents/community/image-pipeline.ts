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
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

// ESM(agents/)에서 CJS(src/lib/) 모듈 import — named export 호환
const require = createRequire(import.meta.url)
const { uploadToR2 } = require('../../src/lib/r2.ts') as {
  uploadToR2: (buffer: Buffer, key: string, contentType: string) => Promise<{ key: string; url: string }>
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_VIDEO_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_GIF_SOURCE_SIZE = 30 * 1024 * 1024 // 30MB — GIF→mp4 변환 소스 한도(애니메이션 GIF는 용량 큼)
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
  isVideo?: boolean // GIF→mp4 변환 결과 등 video 태그로 렌더해야 하는 경우
  skip?: boolean // 아이콘/UI 요소 등 — placeholder 아닌 태그 제거 대상
}

// ── URL 해석 ──

/**
 * fetch용 URL의 HTML 엔티티 디코딩 (&amp;, &#38;, &#x26; → &).
 * sanitize-html이 img/video src의 &를 &amp;로 인코딩하므로, 디코딩 없이 fetch하면
 * 쿼리스트링 이미지(예: pbs.twimg.com/...?format=jpg&amp;name=small)가 404 → 미디어 누락.
 * 이중 인코딩(&amp;amp;)까지 안정될 때까지 반복.
 */
function decodeUrlEntities(src: string): string {
  let prev = ''
  let cur = src.trim()
  while (cur !== prev) {
    prev = cur
    cur = cur
      .replace(/&amp;/gi, '&')
      .replace(/&#0*38;/g, '&')
      .replace(/&#x0*26;/gi, '&')
  }
  return cur
}

/** protocol-relative(//), 절대(/), 상대 URL → https:// 절대 URL (HTML 엔티티 디코딩 포함) */
function resolveUrl(src: string, referer: string): string {
  const url = decodeUrlEntities(src)
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${referer}${url}`
  return `${referer}/${url}`
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

// ── GIF → mp4 변환 ──

/**
 * 애니메이션 GIF buffer를 mp4로 변환 (ffmpeg).
 * 애니메이션은 흔히 5~15MB → mp4로 ~1/10 압축. 시니어 모바일 데이터/OOM 부담 완화 +
 * Next /_next/image 정적변환 회피(video 태그는 프록시 안 탐).
 * ※ 입력은 반드시 gif buffer (animated webp는 호출 전 sharp로 gif 변환할 것 — ffmpeg는 animated webp 입력 불가).
 * ffmpeg 미설치/변환 실패 시 null 반환 → 호출부에서 placeholder.
 */
function convertGifToMp4(gifBuffer: Buffer): Buffer | null {
  const dir = mkdtempSync(resolve(tmpdir(), 'gif2mp4-'))
  const inPath = resolve(dir, 'in.gif')
  const outPath = resolve(dir, 'out.mp4')
  try {
    writeFileSync(inPath, gifBuffer)
    // yuv420p + 짝수 해상도(scale) = 모바일/브라우저 호환 필수. -an 무음. faststart 스트리밍 최적화.
    execFileSync(
      'ffmpeg',
      ['-y', '-i', inPath, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', outPath],
      { stdio: 'ignore', timeout: 60000 },
    )
    const mp4 = readFileSync(outPath)
    if (mp4.length < 100) return null
    return mp4
  } catch (err) {
    console.warn('[media-pipeline] GIF→mp4 변환 실패:', err instanceof Error ? err.message : String(err))
    return null
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
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

  // ── 애니메이션 판별 (gif / animated webp 등 multi-frame) → mp4 변환 ──
  // 네이버 등 CDN은 gif를 animated webp(?type=w710_wp)로 변환해 내려주므로
  // content-type/확장자만으론 부족 → sharp metadata.pages로 프레임 수 확인.
  // content-type 우선 — URL 확장자(.gif)는 신뢰 불가: 네이버는 .gif URL에 ?type= 쿼리로 webp를 내려줌
  let animatedGif: Buffer | null = null
  if (contentType.includes('gif')) {
    animatedGif = buffer // 실제 gif → 그대로 ffmpeg
  } else {
    try {
      const meta = await sharp(buffer).metadata()
      if ((meta.pages ?? 1) > 1) {
        // animated webp 등 multi-frame → gif로 디코딩 (ffmpeg는 animated webp 직접 입력 불가)
        animatedGif = await sharp(buffer, { animated: true }).gif().toBuffer()
      }
    } catch { /* sharp 디코딩 불가 → 정적 이미지로 처리 */ }
  }

  if (animatedGif) {
    if (animatedGif.length > MAX_GIF_SOURCE_SIZE) {
      return { originalUrl: imageUrl, r2Url: null, error: `애니메이션 크기 초과 (${Math.round(animatedGif.length / 1024 / 1024)}MB > 30MB)` }
    }
    const mp4 = convertGifToMp4(animatedGif)
    if (mp4) {
      const key = `scraped/${postKey}/${index}.mp4`
      const { url } = await uploadToR2(mp4, key, 'video/mp4')
      return { originalUrl: imageUrl, r2Url: url, isVideo: true }
    }
    // ffmpeg 미설치/실패 → placeholder (애니메이션 원본 직접 노출은 /_next/image 정적변환·용량 문제)
    return { originalUrl: imageUrl, r2Url: null, error: '애니메이션 mp4 변환 실패' }
  }

  // ── 정적 이미지: WebP 변환 (5MB 초과 시 다운스케일로 복구) ──
  // 고해상도 원본 사진은 흔히 5MB 초과 → 즉시 placeholder 대신 너비 제한 + 품질 압축으로 살림.
  const oversized = buffer.length > MAX_IMAGE_SIZE

  let uploadBuffer: Buffer
  let uploadContentType: string
  let ext: string
  try {
    const metadata = await sharp(buffer).metadata()

    if (
      metadata.width &&
      metadata.height &&
      (metadata.width < MIN_IMAGE_DIMENSION || metadata.height < MIN_IMAGE_DIMENSION)
    ) {
      return { originalUrl: imageUrl, r2Url: null, skip: true, error: '이미지 너무 작음 (아이콘)' }
    }

    const pipeline = sharp(buffer)
    if (oversized && metadata.width && metadata.width > 1600) {
      pipeline.resize({ width: 1600, withoutEnlargement: true })
    }
    uploadBuffer = await pipeline.webp({ quality: oversized ? 72 : 80 }).toBuffer()

    // 그래도 5MB 초과면 한 번 더 강하게 압축 (시니어 모바일 데이터/OOM 보호)
    if (uploadBuffer.length > MAX_IMAGE_SIZE) {
      uploadBuffer = await sharp(buffer).resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer()
    }
    uploadContentType = 'image/webp'
    ext = 'webp'
  } catch {
    // sharp 디코딩 실패: 원본 5MB 이내면 그대로, 초과면 복구 불가 → placeholder
    if (oversized) {
      return { originalUrl: imageUrl, r2Url: null, error: '이미지 크기 초과 (5MB) + 변환 불가' }
    }
    uploadBuffer = buffer
    uploadContentType = contentType || 'image/jpeg'
    ext = contentType.includes('png') ? 'png' : 'jpg'
  }

  // 압축 후에도 한도 초과면 R2 비용 보호 차원에서 실패 (극단 케이스)
  if (uploadBuffer.length > MAX_IMAGE_SIZE) {
    return { originalUrl: imageUrl, r2Url: null, error: `압축 후에도 5MB 초과 (${Math.round(uploadBuffer.length / 1024 / 1024)}MB)` }
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
        if (result.isVideo) {
          // GIF→mp4: <img> 태그를 자동재생 무한반복 무음 video로 교체 (GIF처럼 보이게)
          const videoTag = `<video src="${result.r2Url}" autoplay loop muted playsinline preload="metadata" class="post-video"></video>`
          processedHtml = processedHtml.replace(fullMatch, videoTag)
        } else {
          processedHtml = processedHtml.replaceAll(src, result.r2Url)
          if (!thumbnailUrl) thumbnailUrl = result.r2Url
        }
        imageCount++
      } else if (result.skip) {
        // 아이콘/UI 요소: placeholder 대신 태그 제거
        processedHtml = processedHtml.replace(fullMatch, '')
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
    // 이미 R2에 올린 video(GIF→mp4 변환 결과 등)는 재처리 스킵 — 이중 업로드 + autoplay 속성 손실 방지
    if (src && !src.includes('.r2.dev') && !src.includes('.r2.cloudflarestorage.com')) {
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
