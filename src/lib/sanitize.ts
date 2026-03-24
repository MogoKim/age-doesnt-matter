import sanitize from 'sanitize-html'

/**
 * HTML 새니타이제이션 — XSS 방지
 * 허용: 기본 서식 태그 + 줄바꿈 + 링크
 */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'del', 's',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h3', 'h4',
    'img', 'hr', 'div', 'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'class'],
    iframe: ['src', 'allowfullscreen', 'frameborder', 'allow', 'width', 'height'],
    div: ['class', 'data-youtube-video'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
}

export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, SANITIZE_OPTIONS)
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
