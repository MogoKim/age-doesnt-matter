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
    'video', 'source',
    'figure', 'figcaption', 'aside',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'class'],
    iframe: ['src', 'allowfullscreen', 'frameborder', 'allow', 'width', 'height'],
    video: ['src', 'poster', 'controls', 'width', 'height', 'preload', 'class'],
    source: ['src', 'type'],
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
      // url() 포함 값 차단 — CSS 인젝션으로 외부 리소스 로드 방지
      'color': [/^(?!.*\burl\s*\().*$/i],
      'background': [/^(?!.*\burl\s*\().*$/i],
      'background-color': [/^(?!.*\burl\s*\().*$/i],
      'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      'font-weight': [/^(normal|bold|bolder|lighter|\d{3})$/],
      'font-style': [/^(normal|italic|oblique)$/],
      'line-height': [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      'text-align': [/^(left|center|right|justify)$/],
      'margin': [/^(?!.*\burl\s*\().*$/i],
      'margin-top': [/^(?!.*\burl\s*\().*$/i],
      'margin-bottom': [/^(?!.*\burl\s*\().*$/i],
      'margin-left': [/^(?!.*\burl\s*\().*$/i],
      'margin-right': [/^(?!.*\burl\s*\().*$/i],
      'padding': [/^(?!.*\burl\s*\().*$/i],
      'padding-top': [/^(?!.*\burl\s*\().*$/i],
      'padding-bottom': [/^(?!.*\burl\s*\().*$/i],
      'padding-left': [/^(?!.*\burl\s*\().*$/i],
      'padding-right': [/^(?!.*\burl\s*\().*$/i],
      'border': [/^(?!.*\burl\s*\().*$/i],
      'border-left': [/^(?!.*\burl\s*\().*$/i],
      'border-top': [/^(?!.*\burl\s*\().*$/i],
      'border-radius': [/^\d+(\.\d+)?(px|em|rem|%)(\s+\d+(\.\d+)?(px|em|rem|%))*$/],
      'display': [/^(block|flex|inline-flex|none)$/],
      'width': [/^\d+(\.\d+)?(px|em|rem|%|vw|vh)?$|^auto$/],
      'height': [/^\d+(\.\d+)?(px|em|rem|%|vw|vh)?$|^auto$/],
      'max-width': [/^\d+(\.\d+)?(px|em|rem|%|vw|vh)?$|^none$/],
      'gap': [/^\d+(\.\d+)?(px|em|rem|%)(\s+\d+(\.\d+)?(px|em|rem|%))?$/],
      'align-items': [/^(flex-start|flex-end|center|baseline|stretch)$/],
      'justify-content': [/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/],
      'flex-wrap': [/^(nowrap|wrap|wrap-reverse)$/],
      'flex-shrink': [/^\d+(\.\d+)?$/],
      'overflow': [/^hidden$/],
    },
  },
  allowedIframeHostnames: SANITIZE_OPTIONS.allowedIframeHostnames,
}

export function sanitizeMagazineHtml(dirty: string): string {
  // AI 생성 content에서 마크다운 코드 펜스가 잔존하는 경우 제거
  // 템플릿 내부 어디에든 존재할 수 있으므로 전역 치환
  // 예: <p>```html</p> → 제거, <p>```</p> → 제거
  const stripped = dirty
    .replace(/```html\s*/gi, '')
    .replace(/```\s*/g, '')
  let safeHtml = sanitize(stripped, MAGAZINE_SANITIZE_OPTIONS)
  // H1 중복 방지: JSX가 이미 <h1>을 렌더링하므로 본문 내 h1은 h2로 강등
  safeHtml = safeHtml.replace(/<h1(\s[^>]*)?>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>')
  return safeHtml
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
 * 게시글 HTML 내 R2 이미지 URL을 Next.js Image Optimization으로 프록시
 * 브라우저에서 R2 직접 요청이 실패하므로 /_next/image 프록시 경유
 * *.r2.dev 및 *.r2.cloudflarestorage.com 모두 커버
 */
export function proxyR2Images(html: string): string {
  return html.replace(
    /(<img\s[^>]*?)src="(https:\/\/[^"]*(?:\.r2\.dev|\.r2\.cloudflarestorage\.com)\/[^"]+)"/g,
    (_, before, url) => {
      const proxied = `/_next/image?url=${encodeURIComponent(url)}&w=750&q=80`
      return `${before}src="${proxied}"`
    },
  )
}

/**
 * 매거진 HTML 내 이미지 URL을 Next.js Image Optimization으로 프록시
 * - *.r2.dev / *.r2.cloudflarestorage.com — R2 직접 접근 불가
 * - img.age-doesnt-matter.com — 프로덕션 R2 커스텀 도메인 (CORS 우회를 위해 프록시)
 * [APPLIES TO] proxyR2Images()도 동일 패턴 — 연동 유지
 */
export function proxyMagazineImages(html: string): string {
  // R2 .r2.dev / .r2.cloudflarestorage.com 프록시
  let result = proxyR2Images(html)
  // 프로덕션 커스텀 도메인 프록시
  result = result.replace(
    /(<img\s[^>]*?)src="(https:\/\/img\.age-doesnt-matter\.com\/[^"]+)"/g,
    (_, before, url) => {
      const proxied = `/_next/image?url=${encodeURIComponent(url)}&w=750&q=80`
      return `${before}src="${proxied}"`
    },
  )
  return result
}

/**
 * HTML 태그 제거 → 순수 텍스트 (요약용)
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
