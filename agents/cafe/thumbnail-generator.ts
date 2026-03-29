/**
 * 매거진 썸네일 생성기
 * Playwright + Sharp 기반 — 카드뉴스 렌더러 패턴 재사용
 *
 * 흐름:
 * 1. 카테고리별 배경색 + 제목 → HTML 템플릿 렌더링
 * 2. Playwright 1200×630 스크린샷 (OG 이미지 규격)
 * 3. Sharp JPEG 최적화
 * 4. R2 업로드 → public URL 반환
 */

import { chromium, type Browser, type Page } from 'playwright'
import sharp from 'sharp'
// dynamic import — tsx 정적 분석 .js→.ts 체인 해석 문제 우회
const { uploadToR2 } = await import('../../src/lib/r2.js')

// ─── Types ───

interface ThumbnailInput {
  title: string
  category: string
  postId: string
}

// ─── Category → Color/Emoji Map ───

const CATEGORY_STYLE: Record<string, { bg: string; emoji: string }> = {
  건강: { bg: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)', emoji: '🏃' },
  여행: { bg: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)', emoji: '✈️' },
  요리: { bg: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', emoji: '🍳' },
  재테크: { bg: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', emoji: '💰' },
  문화: { bg: 'linear-gradient(135deg, #E91E63 0%, #F06292 100%)', emoji: '🎭' },
  생활: { bg: 'linear-gradient(135deg, #607D8B 0%, #90A4AE 100%)', emoji: '🌿' },
  일자리: { bg: 'linear-gradient(135deg, #FF5722 0%, #FF8A65 100%)', emoji: '💼' },
}

const DEFAULT_STYLE = { bg: 'linear-gradient(135deg, #FF6F61 0%, #FF8A80 100%)', emoji: '📖' }

function getCategoryStyle(category: string) {
  for (const [key, style] of Object.entries(CATEGORY_STYLE)) {
    if (category.includes(key)) return style
  }
  return DEFAULT_STYLE
}

// ─── HTML Template ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildThumbnailHtml(title: string, category: string): string {
  const style = getCategoryStyle(category)

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1200">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; -webkit-font-smoothing: antialiased; }
body {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: ${style.bg};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 60px 80px;
}
.emoji { font-size: 64px; margin-bottom: 24px; }
.title {
  font-size: 48px;
  font-weight: 800;
  color: #fff;
  line-height: 1.35;
  word-break: keep-all;
  text-shadow: 0 2px 12px rgba(0,0,0,0.2);
  max-width: 960px;
}
.category {
  margin-top: 28px;
  font-size: 22px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
  letter-spacing: 1px;
}
.brand {
  position: absolute;
  bottom: 28px;
  right: 40px;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
}
</style>
</head>
<body>
  <div class="emoji">${style.emoji}</div>
  <div class="title">${escapeHtml(title)}</div>
  <div class="category">${escapeHtml(category)}</div>
  <div class="brand">우리 나이가 어때서</div>
</body>
</html>`
}

// ─── Image Optimization ───

async function optimizeImage(pngBuffer: Buffer): Promise<Buffer> {
  return sharp(pngBuffer)
    .jpeg({ quality: 85, mozjpeg: true })
    .withMetadata({ orientation: undefined })
    .toBuffer()
}

// ─── R2 Key ───

function getDatePrefix(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getR2Key(postId: string): string {
  return `magazine-thumbnails/${getDatePrefix()}/${postId}.jpg`
}

// ─── Main Function ───

export async function generateMagazineThumbnail(
  input: ThumbnailInput,
): Promise<string> {
  const html = buildThumbnailHtml(input.title, input.category)

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    })
    page = await context.newPage()

    await page.setContent(html, { waitUntil: 'networkidle' })

    const pngBuffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    })

    const jpegBuffer = await optimizeImage(Buffer.from(pngBuffer))

    const key = getR2Key(input.postId)
    const { url } = await uploadToR2(jpegBuffer, key, 'image/jpeg')

    console.log(`[ThumbnailGenerator] 업로드 완료: ${key}`)
    return url
  } finally {
    if (page) await page.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}
