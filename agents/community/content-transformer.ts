/**
 * 콘텐츠 변환기 — 외부 HTML 정제 + 출처 표시 + 미디어 보존 + YouTube 변환
 */

import sanitize from 'sanitize-html'
import type { SiteConfig } from './site-configs.js'

/** sanitize-html 허용 규칙 */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'i', 'em', 'u', 'del', 's',
    'a', 'h2', 'h3', 'h4',
    'img',
    'iframe',
    'video', 'source',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
    video: ['src', 'poster', 'controls', 'preload'],
    source: ['src', 'type'],
    div: ['class'],
    span: [],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
  allowedClasses: {
    div: ['source-attribution', 'image-placeholder'],
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
    cleaned = removeElementsByPattern(cleaned, selector)
  }

  // 2. 사이트별 전처리 (sanitize 전)
  cleaned = preClean(cleaned, siteConfig)

  // 3. sanitize-html로 정제
  const sanitized = sanitize(cleaned, SANITIZE_OPTIONS)

  // 4. 사이트별 후처리 (sanitize 후)
  let processed = postClean(sanitized)

  // 5. YouTube 텍스트 URL → iframe 변환
  processed = convertYouTubeUrls(processed)

  // 6. video 태그에 controls 속성 주입
  processed = injectVideoControls(processed)

  // 7. 빈 태그 정리
  processed = cleanEmptyTags(processed)

  // 8. 출처 표시 (CSS 클래스 — 2차 sanitize 통과 보장)
  const attribution = `<div class="source-attribution">📎 출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteConfig.name)}</a></div>`

  return `${processed}\n${attribution}`
}

/**
 * raw_content(창업자 수동 붙여넣기)를 변환
 */
export function transformRawContent(
  rawContent: string,
  sourceUrl: string,
  siteName: string,
): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(rawContent)

  let content: string
  if (isHtml) {
    content = sanitize(rawContent, SANITIZE_OPTIONS)
    content = postClean(content)
    content = convertYouTubeUrls(content)
    content = injectVideoControls(content)
    content = cleanEmptyTags(content)
  } else {
    content = rawContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
      .join('\n')
  }

  const attribution = `<div class="source-attribution">📎 출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteName)}</a></div>`

  return `${content}\n${attribution}`
}

// ── 게시판별 카테고리 키워드 ──

const STORY_KEYWORDS: Record<string, string[]> = {
  '건강': ['건강', '운동', '혈압', '혈당', '관절', '걷기', '식단', '병원', '약', '수술', '다이어트', '허리', '무릎', '혈관', '영양제', '체중'],
  '일상': ['일상', '오늘', '주말', '산책', '커피', '여행', '요리', '취미', '퇴직', '은퇴', '날씨', '장보기', '아침', '저녁', '동네'],
  '고민': ['고민', '걱정', '힘들', '스트레스', '불안', '외로', '우울', '상담', '도움', '어떡해', '조언', '속상'],
  '자녀': ['자녀', '아들', '딸', '손주', '손녀', '육아', '교육', '학교', '결혼', '며느리', '사위', '손자'],
}

const HUMOR_KEYWORDS: Record<string, string[]> = {
  '유머': ['ㅋㅋ', '웃긴', '빵터', '레전드', '개웃', 'ㅎㅎ', '짤', '웃음', '유머', 'ㄷㄷ', '미친', '대박', '헐', 'ㅋㅋㅋ'],
  '힐링': ['힐링', '감동', '눈물', '따뜻', '가슴', '울컥', '편지', '재회', '봉사', '고마', '치유', '위로', '그리움', '사랑'],
  '자랑': ['자랑', '뿌듯', '성공', '해냈', '드디어', '합격', '1등', '수상', '인증', '축하'],
  '추천': ['추천', '강추', '꿀팁', '정보', '소개', '리뷰', '후기', '맛집', '꿀잼', '필수', '공유'],
}

/**
 * 카테고리 자동 분류 (게시판별 키워드 기반)
 */
export function classifyCategory(
  title: string,
  content: string,
  boardType: 'STORY' | 'HUMOR' = 'STORY',
): string {
  const text = `${title} ${content}`.toLowerCase()
  const keywords = boardType === 'HUMOR' ? HUMOR_KEYWORDS : STORY_KEYWORDS

  let bestCategory = '기타'
  let bestScore = 0

  for (const [category, kws] of Object.entries(keywords)) {
    const score = kws.filter((kw) => text.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestCategory
}

// ── 전처리: sanitize 전 외부 링크/wrapper 변환 ──

function preClean(html: string, siteConfig: SiteConfig): string {
  let result = html

  if (siteConfig.id === 'fmkorea') {
    // 펨코 link.php 리다이렉터 → 실제 URL 추출
    result = result.replace(
      /href="https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"&]+)[^"]*"/gi,
      (_, encoded) => `href="${decodeURIComponent(encoded)}"`,
    )

    // 펨코 rel="highslide" 이미지 확대 wrapper → 내부 콘텐츠만 남기기
    result = result.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 펨코 비디오 wrapper 내 썸네일 img 제거 (video가 있는 div 안의 img)
    result = result.replace(
      /(<div[^>]*class="[^"]*auto_media_wrapper[^"]*"[^>]*>[\s\S]*?<video[^>]*>[\s\S]*?)<img[^>]*\/?>(\s*<\/div>)/gi,
      '$1$2',
    )
  }

  if (siteConfig.id === 'natepann') {
    // 네이트판 /attach/imageView 이미지 뷰어 링크 → 내부 콘텐츠만 남기기
    result = result.replace(/<a[^>]*href="\/attach\/imageView[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1')
  }

  // 오유: <b> 태그가 본문 전체를 wrapping하는 패턴 제거
  // <p><b>전체 텍스트</b></p> 같은 구조에서 <b>를 제거
  if (siteConfig.id === 'todayhumor') {
    result = result.replace(/<b>([\s\S]*?)<\/b>/gi, '$1')
  }

  return result
}

// ── 후처리: sanitize 후 잔여 정리 ──

function postClean(html: string): string {
  let result = html

  // 남아있는 rel="highslide" 등 비표준 a wrapper 제거
  result = result.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 남아있는 /attach/imageView 링크 제거
  result = result.replace(/<a[^>]*href=["']\/attach\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // link.fmkorea.org 리다이렉터가 남아있으면 실제 URL로 변환
  result = result.replace(
    /<a[^>]*href=["']https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"'&]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, encoded, inner) => `<a href="${decodeURIComponent(encoded)}" target="_blank" rel="noopener noreferrer">${inner}</a>`,
  )

  return result
}

// ── 빈 태그 정리 ──

function cleanEmptyTags(html: string): string {
  return html
    // <p> 안에 실질적 콘텐츠 없는 경우 제거
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p>\s*(?:<br\s*\/?>)\s*<\/p>/gi, '')
    .replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    // <div> 안에 콘텐츠 없는 경우 제거 (source-attribution 제외)
    .replace(/<div>\s*<\/div>/gi, '')
    // 연속 br 3개 이상 → 2개로 줄임
    .replace(/(<br\s*\/?>[\s]*){3,}/gi, '<br><br>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ── YouTube URL → iframe 변환 ──

/**
 * 텍스트/링크 형태의 YouTube URL을 iframe 임베드로 변환
 */
function convertYouTubeUrls(html: string): string {
  // Step 1: <a> 태그 안의 YouTube 링크를 iframe으로 교체
  const ytLinkRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi
  let result = html.replace(ytLinkRegex, (_match, _href, videoId) => {
    return makeYouTubeIframe(videoId)
  })

  // Step 2: 텍스트 내 bare YouTube URL을 iframe으로 교체
  const bareYtRegex = /(?<![="'])https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})(?:[^\s<]*)/g
  result = result.replace(bareYtRegex, (_match, videoId) => {
    return makeYouTubeIframe(videoId)
  })

  return result
}

function makeYouTubeIframe(videoId: string): string {
  return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}" width="100%" height="400" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
}

// ── video 태그 controls 주입 ──

function injectVideoControls(html: string): string {
  return html.replace(/<video(?![^>]*controls)([^>]*)>/gi, '<video controls$1>')
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
 */
function removeElementsByPattern(html: string, selector: string): string {
  // iframe:not([src*="youtube"]) 패턴
  const notMatch = selector.match(/^(\w+):not\(\[src\*="([^"]+)"\]\)$/)
  if (notMatch) {
    const tag = notMatch[1]
    const keep = notMatch[2]
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}[^>]*\\/?>`, 'gi')
    return html.replace(regex, (match) => (match.includes(keep) ? match : ''))
  }

  // .클래스명 패턴
  if (selector.startsWith('.')) {
    const cls = selector.slice(1)
    const regex = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi')
    return html.replace(regex, '')
  }

  // 태그명 패턴
  if (/^\w+$/.test(selector)) {
    const regex = new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>|<${selector}[^>]*\\/?>`, 'gi')
    return html.replace(regex, '')
  }

  return html
}
