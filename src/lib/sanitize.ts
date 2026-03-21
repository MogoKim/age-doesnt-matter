import DOMPurify from 'isomorphic-dompurify'

/**
 * HTML 새니타이제이션 — XSS 방지
 * 허용: 기본 서식 태그 + 줄바꿈 + 링크
 */
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'del', 's',
  'ul', 'ol', 'li', 'blockquote', 'a', 'h3', 'h4',
]

const ALLOWED_ATTR = ['href', 'target', 'rel']

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * 평문 → HTML 변환 (줄바꿈 → <p> 태그) 후 새니타이즈
 */
export function plainTextToSafeHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const html = `<p>${escaped.replace(/\n/g, '</p><p>')}</p>`
  return sanitizeHtml(html)
}

/**
 * HTML 태그 제거 → 순수 텍스트 (요약용)
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
