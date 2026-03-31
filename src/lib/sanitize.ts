import sanitize from 'sanitize-html'

/**
 * HTML 새니타이제이션 — XSS 방지
 * 허용: 기본 서식 태그 + 줄바꿈 + 링크
 */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'del', 's',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h2', 'h3', 'h4',
    'img', 'hr', 'div', 'iframe',
    'figure', 'figcaption', 'aside',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'class'],
    iframe: ['src', 'allowfullscreen', 'frameborder', 'allow', 'width', 'height'],
    div: ['class', 'data-youtube-video'],
    aside: ['class'],
    figure: ['class'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
}

export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, SANITIZE_OPTIONS)
}

/**
 * 매거진 전용 새니타이제이션 — 봇 생성 콘텐츠이므로 인라인 스타일 허용
 * 사용자 입력(댓글/게시글)에는 절대 사용 금지
 */
const MAGAZINE_SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    ...SANITIZE_OPTIONS.allowedTags as string[],
    'span', 'article', 'h1', 'section',
  ],
  allowedAttributes: {
    ...SANITIZE_OPTIONS.allowedAttributes,
    '*': ['style', 'class'],
    img: ['src', 'alt', 'width', 'height', 'class', 'loading', 'style'],
  },
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'background': [/.*/],
      'background-color': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'font-style': [/.*/],
      'line-height': [/.*/],
      'text-align': [/.*/],
      'margin': [/.*/],
      'margin-top': [/.*/],
      'margin-bottom': [/.*/],
      'margin-left': [/.*/],
      'margin-right': [/.*/],
      'padding': [/.*/],
      'padding-top': [/.*/],
      'padding-bottom': [/.*/],
      'padding-left': [/.*/],
      'padding-right': [/.*/],
      'border': [/.*/],
      'border-left': [/.*/],
      'border-top': [/.*/],
      'border-radius': [/.*/],
      'border-none': [/.*/],
      'display': [/^(block|flex|inline-flex|none)$/],
      'width': [/.*/],
      'height': [/.*/],
      'max-width': [/.*/],
      'gap': [/.*/],
      'align-items': [/.*/],
      'justify-content': [/.*/],
      'flex-wrap': [/.*/],
      'flex-shrink': [/.*/],
      'overflow': [/^hidden$/],
    },
  },
  allowedIframeHostnames: SANITIZE_OPTIONS.allowedIframeHostnames,
}

export function sanitizeMagazineHtml(dirty: string): string {
  return sanitize(dirty, MAGAZINE_SANITIZE_OPTIONS)
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
