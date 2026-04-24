/**
 * Card News Renderer — Playwright + Sharp 기반 카드뉴스 이미지 렌더링
 *
 * v1: cardNewsType별 단일 템플릿 (news-trend / info-topic / community)
 * v2: slideType별 개별 템플릿 (11종) + 확장 데이터 필드
 *
 * 흐름:
 * 1. 템플릿 HTML 로드 (v1: cardNewsType별 / v2: slideType별)
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

// ─── v1 Types (backward compat) ───

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

// ─── v2 Types ───

export interface CardNewsSlideData {
  slideType: string
  title: string
  body?: string
  bulletPoints?: string[]
  statNumber?: string
  statLabel?: string
  stepNumber?: number
  stepTotal?: number
  listRank?: number
  imageUrl?: string
  ctaText?: string
  ctaUrl?: string
  icon?: string
  leftLabel?: string
  leftText?: string
  rightLabel?: string
  rightText?: string
  attribution?: string
  slideNumber: number
  totalSlides: number
  category: string
}

// ─── Template Loading ───

// v1 templates
const TEMPLATE_MAP: Record<CardNewsType, string> = {
  NEWS_TREND: 'news-trend.html',
  INFO_TOPIC: 'info-topic.html',
  COMMUNITY_PROMO: 'community.html',
}

// v2 templates — per slide type
const TEMPLATE_MAP_V2: Record<string, string> = {
  hook: 'hook.html',
  context: 'context.html',
  stat: 'stat.html',
  story: 'story.html',
  tip: 'tip.html',
  comparison: 'comparison.html',
  quote: 'quote.html',
  listicle: 'listicle.html',
  stepguide: 'stepguide.html',
  summary: 'summary-v2.html',
  cta: 'cta-v2.html',
}

function loadTemplate(cardNewsType: CardNewsType): string {
  const templateFile = TEMPLATE_MAP[cardNewsType]
  const templatePath = new URL(`./templates/${templateFile}`, import.meta.url)
  return readFileSync(templatePath, 'utf-8')
}

function loadTemplateV2(slideType: string): string {
  const templateFile = TEMPLATE_MAP_V2[slideType]
  if (!templateFile) {
    throw new Error(`알 수 없는 슬라이드 타입: ${slideType} — 사용 가능: ${Object.keys(TEMPLATE_MAP_V2).join(', ')}`)
  }
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

/**
 * v1 template rendering — supports cover/content/summary/cta slide types
 */
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

/**
 * v2 template rendering — supports all 11 slide types with extended data fields
 */
function renderTemplateV2(template: string, slide: CardNewsSlideData): string {
  let html = template

  // ── Basic fields ──
  html = html.replace(/\{\{slideType\}\}/g, slide.slideType)
  html = html.replace(/\{\{title\}\}/g, escapeHtml(slide.title))
  html = html.replace(/\{\{slideNumber\}\}/g, String(slide.slideNumber))
  html = html.replace(/\{\{totalSlides\}\}/g, String(slide.totalSlides))
  html = html.replace(/\{\{category\}\}/g, escapeHtml(slide.category))

  // ── Optional text fields (conditional sections + value) ──
  const optionalTextFields: Array<{ key: string; value: string | undefined }> = [
    { key: 'body', value: slide.body },
    { key: 'statNumber', value: slide.statNumber },
    { key: 'statLabel', value: slide.statLabel },
    { key: 'icon', value: slide.icon },
    { key: 'ctaText', value: slide.ctaText },
    { key: 'ctaUrl', value: slide.ctaUrl },
    { key: 'leftLabel', value: slide.leftLabel },
    { key: 'leftText', value: slide.leftText },
    { key: 'rightLabel', value: slide.rightLabel },
    { key: 'rightText', value: slide.rightText },
    { key: 'attribution', value: slide.attribution },
  ]

  for (const { key, value } of optionalTextFields) {
    const sectionRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, 'g')
    const valueRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')

    if (value !== undefined && value !== '') {
      html = html.replace(sectionRegex, '$1')
      // icon (emoji) should not be HTML-escaped
      html = html.replace(valueRegex, key === 'icon' || key === 'ctaUrl' ? value : escapeHtml(value))
    } else {
      html = html.replace(sectionRegex, '')
      html = html.replace(valueRegex, '')
    }
  }

  // ── Numeric fields ──
  if (slide.stepNumber !== undefined) {
    html = html.replace(/\{\{#stepNumber\}\}([\s\S]*?)\{\{\/stepNumber\}\}/g, '$1')
    html = html.replace(/\{\{stepNumber\}\}/g, String(slide.stepNumber))
  } else {
    html = html.replace(/\{\{#stepNumber\}\}[\s\S]*?\{\{\/stepNumber\}\}/g, '')
    html = html.replace(/\{\{stepNumber\}\}/g, '')
  }

  if (slide.stepTotal !== undefined) {
    html = html.replace(/\{\{#stepTotal\}\}([\s\S]*?)\{\{\/stepTotal\}\}/g, '$1')
    html = html.replace(/\{\{stepTotal\}\}/g, String(slide.stepTotal))
  } else {
    html = html.replace(/\{\{#stepTotal\}\}[\s\S]*?\{\{\/stepTotal\}\}/g, '')
    html = html.replace(/\{\{stepTotal\}\}/g, '')
  }

  if (slide.listRank !== undefined) {
    html = html.replace(/\{\{#listRank\}\}([\s\S]*?)\{\{\/listRank\}\}/g, '$1')
    html = html.replace(/\{\{listRank\}\}/g, String(slide.listRank))
  } else {
    html = html.replace(/\{\{#listRank\}\}[\s\S]*?\{\{\/listRank\}\}/g, '')
    html = html.replace(/\{\{listRank\}\}/g, '')
  }

  // ── Image URL ──
  if (slide.imageUrl) {
    html = html.replace(/\{\{#imageUrl\}\}([\s\S]*?)\{\{\/imageUrl\}\}/g, '$1')
    html = html.replace(/\{\{imageUrl\}\}/g, slide.imageUrl)
  } else {
    html = html.replace(/\{\{#imageUrl\}\}[\s\S]*?\{\{\/imageUrl\}\}/g, '')
    html = html.replace(/\{\{imageUrl\}\}/g, '')
  }

  // ── Bullet points ──
  if (slide.bulletPoints && slide.bulletPoints.length > 0) {
    html = html.replace(/\{\{#hasBullets\}\}([\s\S]*?)\{\{\/hasBullets\}\}/g, '$1')
    const bulletHtml = slide.bulletPoints
      .map((bp) => `<li>${escapeHtml(bp)}</li>`)
      .join('\n      ')
    html = html.replace(
      /\{\{#bulletPoints\}\}<li>\{\{\.\}\}<\/li>\{\{\/bulletPoints\}\}/g,
      bulletHtml,
    )
  } else {
    html = html.replace(/\{\{#hasBullets\}\}[\s\S]*?\{\{\/hasBullets\}\}/g, '')
  }

  // ── Slide type conditionals (for templates that handle multiple types) ──
  const allTypes = [
    'hook', 'context', 'stat', 'story', 'tip', 'comparison',
    'quote', 'listicle', 'stepguide', 'summary', 'cta',
  ]

  for (const t of allTypes) {
    const condKey = `is${t.charAt(0).toUpperCase()}${t.slice(1)}`
    const condRegex = new RegExp(`\\{\\{#${condKey}\\}\\}([\\s\\S]*?)\\{\\{\\/${condKey}\\}\\}`, 'g')
    html = html.replace(condRegex, slide.slideType === t ? '$1' : '')
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

// ─── R2 Upload Helpers ───

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

function getR2KeyV2(slideIndex: number): string {
  const datePrefix = getDatePrefix()
  return `card-news/${datePrefix}/v2-slide-${slideIndex + 1}.jpg`
}

// ─── v1 Render Function (backward compat) ───

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

// ─── v2 Render Function ───

export async function renderCardNewsV2(
  slides: CardNewsSlideData[],
): Promise<RenderResult> {
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

      // Load per-slide-type template
      const template = loadTemplateV2(slide.slideType)
      const renderedHtml = renderTemplateV2(template, slide)

      await page.setContent(renderedHtml, { waitUntil: 'networkidle' })

      // Screenshot at exact canvas size
      const pngBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      })

      // Optimize with Sharp
      const jpegBuffer = await optimizeImage(Buffer.from(pngBuffer))

      // Upload to R2
      const key = getR2KeyV2(i)
      const { url } = await uploadToR2(jpegBuffer, key, 'image/jpeg')
      imageUrls.push(url)

      console.log(
        `[CardNewsRendererV2] Slide ${i + 1}/${slides.length} (${slide.slideType}) uploaded: ${key}`,
      )
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
