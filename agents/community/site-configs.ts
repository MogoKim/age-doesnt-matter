/**
 * 외부 커뮤니티 사이트별 스크래핑 설정
 * 셀렉터, UA 풀, Cloudflare 감지 로직
 */

export interface SiteConfig {
  id: string
  name: string
  urlPatterns: RegExp[]
  selectors: {
    title: string[]      // 우선순위 순서
    content: string[]
    images: string       // content 내부 img
    removeElements: string[] // 제거할 요소 (광고, 네비 등)
  }
  headless: boolean
  minDelay: number       // ms — 페이지 로드 후 대기
  cloudflareProtected: boolean
}

export const SITE_CONFIGS: SiteConfig[] = [
  {
    id: 'fmkorea',
    name: '펨코',
    urlPatterns: [/fmkorea\.com/, /fm\.team/],
    selectors: {
      title: ['span.np_18px_span', 'h1.np_18px_span', 'div.rd_hd span.rd_sd_1', 'h1'],
      content: ['div.rd_body article', 'div.xe_content', 'article'],
      images: 'img',
      removeElements: [
        '.rd_hd', '.rd_ft', '.rd_nav', '.botBanner',
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.comment_area', '.share_btn_area', '.btm_area',
        '.rd_body .signature', 'ins', '.ad_area',
      ],
    },
    headless: true,
    minDelay: 3000,
    cloudflareProtected: true,
  },
  {
    id: 'todayhumor',
    name: '오늘의유머',
    urlPatterns: [/todayhumor\.co\.kr/],
    selectors: {
      title: ['div.writerInfoT span.title', 'td.subject span', 'h1'],
      content: ['div.viewContent', 'div#wrap_body', 'div.contentBody'],
      images: 'img',
      removeElements: [
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.viewBox .addThis', '.viewBox .vote_area',
        '.ad_content', 'ins', '.comment_wrap',
      ],
    },
    headless: true,
    minDelay: 2000,
    cloudflareProtected: false,
  },
  {
    id: 'natepann',
    name: '네이트판',
    urlPatterns: [/pann\.nate\.com/],
    selectors: {
      title: ['h3.tit-content', 'div.posting-title h3', 'h1'],
      content: ['div.posting-content', 'div.post-content', 'div.contentArea'],
      images: 'img',
      removeElements: [
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.posting-tool', '.posting-share', '.posting-ad',
        'ins', '.ad_area', '.comment_area',
      ],
    },
    headless: true,
    minDelay: 2000,
    cloudflareProtected: false,
  },
]

/**
 * URL에서 사이트 설정 매칭
 */
export function detectSite(url: string): SiteConfig | null {
  return SITE_CONFIGS.find((c) => c.urlPatterns.some((p) => p.test(url))) ?? null
}

/**
 * Chrome User-Agent 로테이션
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
]

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

/**
 * Cloudflare 챌린지 감지
 */
export function isCloudflareChallenge(html: string): boolean {
  const markers = [
    'cf-challenge',
    'Checking your browser',
    'cf_chl_opt',
    'Just a moment',
    'challenge-platform',
  ]
  return markers.some((m) => html.includes(m))
}
