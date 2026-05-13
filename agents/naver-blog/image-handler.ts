/**
 * 이미지 핸들러
 * R2 공개 URL → 로컬 temp 파일 다운로드 → Playwright 업로드용 경로 반환
 *
 * 흐름: thumbnailUrl(hero) + HTML 본문 이미지(최대 2개) → temp/{sessionId}/
 * 정리: cleanup(tempDir) 호출 시 temp 디렉토리 삭제 (poster.ts 완료 후)
 */

import { createWriteStream, mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { resolve } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import { BANNERS_DIR, CONTENT_POLICY, TEMP_DIR } from './config.js'

// ── 타입 ──

export interface LocalImageSet {
  heroPath: string | null        // 대표 이미지 (썸네일)
  bodyPaths: string[]            // 본문 삽입 이미지 (최대 2개)
  bannerPath: string | null      // 띠배너 (banners/ 폴더, 없으면 null)
  tempDir: string                // 세션 temp 디렉토리 (cleanup용)
}

// ── HTML에서 이미지 src 추출 ──

export function extractImagesFromHtml(html: string): string[] {
  const urls: string[] = []
  // <img src="..." 또는 <img ... src="..." 패턴
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1]
    if (url && url.startsWith('http')) {
      urls.push(url)
    }
  }
  return urls
}

// ── 단일 파일 다운로드 ──

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UnaeoBot/1.0)' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      console.warn(`[ImageHandler] 다운로드 실패 (${response.status}): ${url}`)
      return false
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      console.warn(`[ImageHandler] 이미지가 아닌 응답: ${contentType} — ${url}`)
      return false
    }

    if (response.body) {
      const writeStream = createWriteStream(destPath)
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), writeStream)
    }
    return true
  } catch (err) {
    console.warn(`[ImageHandler] 다운로드 오류: ${url}`, err)
    return false
  }
}

// ── 확장자 추출 ──

function guessExt(url: string): string {
  const clean = url.split('?')[0]
  const ext = clean.split('.').pop()?.toLowerCase()
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }
  return 'jpg'
}

// ── 랜덤 배너 선택 ──

export function getRandomBanner(): string | null {
  if (!existsSync(BANNERS_DIR)) return null

  const files = readdirSync(BANNERS_DIR).filter(f =>
    /\.(jpg|jpeg|png|webp)$/i.test(f),
  )
  if (files.length === 0) return null

  const pick = files[Math.floor(Math.random() * files.length)]
  return resolve(BANNERS_DIR, pick)
}

// ── 메인: 이미지 세트 준비 ──

export async function prepareImages(
  thumbnailUrl: string | null,
  htmlContent: string,
): Promise<LocalImageSet> {
  // 세션별 temp 디렉토리 생성
  mkdirSync(TEMP_DIR, { recursive: true })
  const sessionId = randomUUID().slice(0, 8)
  const tempDir = resolve(TEMP_DIR, sessionId)
  mkdirSync(tempDir)

  let heroPath: string | null = null
  const bodyPaths: string[] = []

  // 1. 대표 이미지 (썸네일) 다운로드
  if (thumbnailUrl) {
    const ext = guessExt(thumbnailUrl)
    const dest = resolve(tempDir, `hero.${ext}`)
    const ok = await downloadFile(thumbnailUrl, dest)
    if (ok) {
      heroPath = dest
      console.log(`[ImageHandler] 대표 이미지 준비: ${dest}`)
    } else {
      console.warn('[ImageHandler] 대표 이미지 다운로드 실패 — 본문 이미지로 대체 시도')
    }
  }

  // 2. 본문 이미지 추출 + 다운로드 (최대 maxBodyImages개)
  const bodyImageUrls = extractImagesFromHtml(htmlContent)
  const limit = CONTENT_POLICY.maxBodyImages

  for (let i = 0; i < bodyImageUrls.length && bodyPaths.length < limit; i++) {
    const url = bodyImageUrls[i]
    // 대표 이미지와 중복 방지
    if (thumbnailUrl && url === thumbnailUrl) continue

    const ext = guessExt(url)
    const dest = resolve(tempDir, `body-${bodyPaths.length}.${ext}`)
    const ok = await downloadFile(url, dest)
    if (ok) {
      bodyPaths.push(dest)
      console.log(`[ImageHandler] 본문 이미지 준비: ${dest}`)
    }
  }

  // 3. heroPath가 null이면 첫 번째 본문 이미지를 hero로 승격
  if (!heroPath && bodyPaths.length > 0) {
    heroPath = bodyPaths.shift() ?? null
  }

  // 4. 배너 이미지 (banners/ 폴더)
  const bannerPath = getRandomBanner()
  if (bannerPath) {
    console.log(`[ImageHandler] 배너 선택: ${bannerPath}`)
  }

  console.log(`[ImageHandler] 이미지 준비 완료 — hero: ${heroPath ? '✅' : '❌'}, 본문: ${bodyPaths.length}개, 배너: ${bannerPath ? '✅' : '❌'}`)
  return { heroPath, bodyPaths, bannerPath, tempDir }
}

// ── 정리 (poster.ts 완료 후 호출) ──

export function cleanupImages(tempDir: string): void {
  try {
    rmSync(tempDir, { recursive: true, force: true })
    console.log(`[ImageHandler] temp 정리 완료: ${tempDir}`)
  } catch (err) {
    console.warn('[ImageHandler] temp 정리 오류:', err)
  }
}
