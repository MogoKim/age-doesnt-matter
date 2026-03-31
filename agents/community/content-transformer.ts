/**
 * 콘텐츠 변환기 — 외부 HTML 정제 + 출처 표시 + 스타일 정리
 */

import sanitize from 'sanitize-html'
import type { SiteConfig } from './site-configs.js'

/** sanitize-html 허용 규칙 (src/lib/sanitize.ts 기반) */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'del', 's',
    'a', 'h2', 'h3', 'h4',
    'img',
    'iframe',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
    div: ['style'],
    span: ['style'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
  // 인라인 스타일 중 허용할 것만
  allowedStyles: {
    div: {
      'text-align': [/.*/],
    },
    span: {
      'font-weight': [/.*/],
    },
  },
}

/**
 * 외부 HTML을 우리 사이트용으로 변환
 */
export function transformContent(
  rawHtml: string,
  sourceUrl: string,
  siteConfig: SiteConfig,
): string {
  // 1. 불필요 요소 제거 (사이트별)
  let cleaned = rawHtml
  for (const selector of siteConfig.selectors.removeElements) {
    // 간단한 태그/클래스 기반 제거 (정규식)
    cleaned = removeElementsByPattern(cleaned, selector)
  }

  // 2. sanitize-html로 정제
  const sanitized = sanitize(cleaned, SANITIZE_OPTIONS)

  // 3. 빈 태그 정리
  const tidied = sanitized
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<div>\s*<\/div>/g, '')
    .replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/g, '<br><br>')
    .replace(/&nbsp;/g, ' ')
    .trim()

  // 4. 출처 표시 추가
  const attribution = `
<div style="margin-top:32px;padding:16px;background:#f8f8f8;border-radius:12px;font-size:15px;color:#888;">
  📎 출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteConfig.name)}</a>
</div>`.trim()

  return `${tidied}\n${attribution}`
}

/**
 * raw_content(창업자 수동 붙여넣기)를 변환
 * 사이트별 셀렉터 정리 없이, sanitize만 적용
 */
export function transformRawContent(
  rawContent: string,
  sourceUrl: string,
  siteName: string,
): string {
  // plain text인지 HTML인지 판단
  const isHtml = /<[a-z][\s\S]*>/i.test(rawContent)

  let content: string
  if (isHtml) {
    content = sanitize(rawContent, SANITIZE_OPTIONS)
  } else {
    // plain text → 줄바꿈을 <p> 태그로 변환
    content = rawContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
      .join('\n')
  }

  const attribution = `
<div style="margin-top:32px;padding:16px;background:#f8f8f8;border-radius:12px;font-size:15px;color:#888;">
  📎 출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteName)}</a>
</div>`.trim()

  return `${content}\n${attribution}`
}

/**
 * 카테고리 자동 분류 (키워드 기반)
 */
export function classifyCategory(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase()

  const categoryKeywords: Record<string, string[]> = {
    '건강': ['건강', '운동', '혈압', '혈당', '관절', '걷기', '식단', '병원', '약', '수술', '다이어트'],
    '유머': ['ㅋㅋ', '웃긴', '빵터', '레전드', '미친', '개웃', 'ㅎㅎ', '짤', '웃음', '유머'],
    '감동': ['감동', '눈물', '힐링', '따뜻', '가슴', '울컥', '편지', '재회', '봉사', '고마'],
    '고민': ['고민', '걱정', '힘들', '스트레스', '불안', '외로', '우울', '상담', '도움'],
    '일상': ['일상', '오늘', '주말', '산책', '커피', '여행', '요리', '취미', '퇴직', '은퇴'],
  }

  let bestCategory = '기타'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.filter((kw) => text.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestCategory
}

// ── 유틸 ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * CSS 셀렉터 패턴으로 HTML 요소 제거 (간이 구현)
 * 지원: 태그명, .클래스, #아이디, 태그:not([src*="youtube"])
 */
function removeElementsByPattern(html: string, selector: string): string {
  // iframe:not([src*="youtube"]) 패턴
  const notMatch = selector.match(/^(\w+):not\(\[src\*="([^"]+)"\]\)$/)
  if (notMatch) {
    const tag = notMatch[1]
    const keep = notMatch[2]
    const regex = new RegExp(`<${tag}[^>]*>.*?<\\/${tag}>|<${tag}[^>]*\\/?>`, 'gis')
    return html.replace(regex, (match) => (match.includes(keep) ? match : ''))
  }

  // .클래스명 패턴
  if (selector.startsWith('.')) {
    const cls = selector.slice(1)
    const regex = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>.*?<\\/[^>]+>`, 'gis')
    return html.replace(regex, '')
  }

  // 태그명 패턴
  if (/^\w+$/.test(selector)) {
    const regex = new RegExp(`<${selector}[^>]*>.*?<\\/${selector}>|<${selector}[^>]*\\/?>`, 'gis')
    return html.replace(regex, '')
  }

  return html
}
