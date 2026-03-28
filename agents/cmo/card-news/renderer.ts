/**
 * Card News Renderer — Playwright + Sharp 기반 카드뉴스 이미지 렌더링
 *
 * 흐름:
 * 1. 템플릿 HTML 로드 (cardNewsType별)
 * 2. 슬라이드별 데이터 주입 (Mustache-style)
 * 3. Playwright로 1080x1350 스크린샷
 * 4. Sharp로 JPEG 최적화 (quality 85, strip metadata)
 * 5. R2 업로드 → public URL 반환
 */

import { chromium, type Browser, type Page } from 'playwright'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
// dynamic import — tsx 정적 분석 .js→.ts 체인 해석 문제 우회
const { uploadToR2 } = await import('../../../src/lib/r2.js')

// ─── Types ───

export interface SlideData {
  type: 'cover' | 'content' | 'summary' | 'cta'
  title: string
  subtitle?: string
  body?: string
  bulletPoints?: string[]
  slideNumber: number
  totalSlides: number
  ctaText?: string
  // community type specific
  postTitle?: string
  postAuthor?: string
  postSnippet?: string
}

export interface RenderResult {
  imageUrls: string[]
  thumbnailUrl: string // first slide URL
}

type CardNewsType = 'NEWS_TREND' | 'INFO_TOPIC' | 'COMMUNITY_PROMO'

// ─── Template Loading ───

const TEMPLATE_MAP: Record<CardNewsType, string> = {
  NEWS_TREND: 'news-trend.html',
  INFO_TOPIC: 'info-topic.html',
  COMMUNITY_PROMO: 'community.html',
}

function loadTemplate(cardNewsType: CardNewsType): string {
  const templateFile = TEMPLATE_MAP[cardNewsType]
  const templatePath = new URL(`./templates/${templateFile}`, import.meta.url)
  return readFileSync(templatePath, 'utf-8')
}

// ─── Mustache-style Template Rendering ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTemplate(template: string, slide: SlideData): string {
  let html = template

  // Replace simple placeholders
  html = html.replace(/\{\{type\}\}/g, slide.type)
  html = html.replace(/\{\{title\}\}/g, escapeHtml(slide.title))
  html = html.replace(/\{\{slideNumber\}\}/g, String(slide.slideNumber))
  html = html.replace(/\{\{totalSlides\}\}/g, String(slide.totalSlides))

  // Optional fields
  if (slide.subtitle) {
    html = html.replace(/\{\{#subtitle\}\}([\s\S]*?)\{\{\/subtitle\}\}/g, '$1')
    html = html.replace(/\{\{subtitle\}\}/g, escapeHtml(slide.subtitle))
  } else {
    html = html.replace(/\{\{#subtitle\}\}[\s\S]*?\{\{\/subtitle\}\}/g, '')
  }

  if (slide.body) {
    html = html.replace(/\{\{#body\}\}([\s\S]*?)\{\{\/body\}\}/g, '$1')
    html = html.replace(/\{\{body\}\}/g, escapeHtml(slide.body))
  } else {
    html = html.replace(/\{\{#body\}\}[\s\S]*?\{\{\/body\}\}/g, '')
  }

  // Bullet points
  if (slide.bulletPoints && slide.bulletPoints.length > 0) {
    html = html.replace(/\{\{#hasBullets\}\}([\s\S]*?)\{\{\/hasBullets\}\}/g, '$1')
    const bulletHtml = slide.bulletPoints
      .map((bp) => `<li>${escapeHtml(bp)}</li>`)
      .join('\n      ')
    html = html.replace(/\{\{#bulletPoints\}\}<li>\{\{\.\}\}<\/li>\{\{\/bulletPoints\}\}/g, bulletHtml)
  } else {
    html = html.replace(/\{\{#hasBullets\}\}[\s\S]*?\{\{\/hasBullets\}\}/g, '')
  }

  // Slide type conditionals
  html = html.replace(
    /\{\{#isCover\}\}([\s\S]*?)\{\{\/isCover\}\}/g,
    slide.type === 'cover' ? '$1' : '',
  )
  html = html.replace(
    /\{\{#isContent\}\}([\s\S]*?)\{\{\/isContent\}\}/g,
    slide.type === 'content' ? '$1' : '',
  )
  html = html.replace(
    /\{\{#isCta\}\}([\s\S]*?)\{\{\/isCta\}\}/g,
    slide.type === 'cta' ? '$1' : '',
  )

  // CTA text
  if (slide.ctaText) {
    html = html.replace(/\{\{ctaText\}\}/g, escapeHtml(slide.ctaText))
  }

  // Community post card
  if (slide.postTitle && slide.postAuthor) {
    html = html.replace(/\{\{#hasPostCard\}\}([\s\S]*?)\{\{\/hasPostCard\}\}/g, '$1')
    html = html.replace(/\{\{postTitle\}\}/g, escapeHtml(slide.postTitle))
    html = html.replace(/\{\{postAuthor\}\}/g, escapeHtml(slide.postAuthor))
    html = html.replace(/\{\{postSnippet\}\}/g, escapeHtml(slide.postSnippet ?? ''))
  } else {
    html = html.replace(/\{\{#hasPostCard\}\}[\s\S]*?\{\{\/hasPostCard\}\}/g, '')
  }

  return html
}

// ─── Image Optimization ───

async function optimizeImage(pngBuffer: Buffer): Promise<Buffer> {
  return sharp(pngBuffer)
    .jpeg({ quality: 85, mozjpeg: true })
    .withMetadata({ orientation: undefined })
    .toBuffer()
}

// ─── R2 Upload ───

function getDatePrefix(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getR2Key(cardNewsType: CardNewsType, slideIndex: number): string {
  const typeSlug = cardNewsType.toLowerCase().replace(/_/g, '-')
  const datePrefix = getDatePrefix()
  return `card-news/${datePrefix}/${typeSlug}-slide-${slideIndex + 1}.jpg`
}

// ─── Main Render Function ───

export async function renderCardNews(
  cardNewsType: CardNewsType,
  slides: SlideData[],
): Promise<RenderResult> {
  const template = loadTemplate(cardNewsType)
  const imageUrls: string[] = []

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1,
    })
    page = await context.newPage()

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const renderedHtml = renderTemplate(template, slide)

      await page.setContent(renderedHtml, { waitUntil: 'networkidle' })

      // Screenshot at exact canvas size
      const pngBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      })

      // Optimize with Sharp
      const jpegBuffer = await optimizeImage(Buffer.from(pngBuffer))

      // Upload to R2
      const key = getR2Key(cardNewsType, i)
      const { url } = await uploadToR2(jpegBuffer, key, 'image/jpeg')
      imageUrls.push(url)

      console.log(`[CardNewsRenderer] Slide ${i + 1}/${slides.length} uploaded: ${key}`)
    }
  } finally {
    if (page) await page.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }

  return {
    imageUrls,
    thumbnailUrl: imageUrls[0] ?? '',
  }
}
