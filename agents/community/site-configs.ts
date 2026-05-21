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
  // 원본 댓글 수집 셀렉터 (removeElements 실행 전에 먼저 읽음)
  commentSelectors?: {
    item: string   // 개별 댓글 컨테이너
    text: string   // 댓글 텍스트 요소
    author?: string // 댓글 작성자 (원글 작성자 제외 필터용)
  }
  postAuthorSelectors?: string[] // 원글 작성자 추출 (자기 댓글 제외용)
  requiresSession?: boolean      // true → storage-state.json 필요. 없으면 GHA skip (PENDING 유지)
  contentFrame?: string          // iframe name (예: 'cafe_main'). 없으면 page 직접 사용
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
      title: ['span.np_18px_span', 'h1.np_18px span', 'div.top_area h1', 'h1'],
      content: ['div.xe_content', 'div.rd_body article', 'article'],
      images: 'img',
      removeElements: [
        '.rd_hd', '.rd_ft', '.rd_nav', '.botBanner',
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.comment_area', '.share_btn_area', '.btm_area',
        '.rd_body .signature', 'ins', '.ad_area',
        '.document_address', '.fm_vote', '.fm_btn_area',
      ],
    },
    commentSelectors: {
      item: '.comment_area .list_item',
      text: '.xe_content',
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
      title: ['div.viewSubjectDiv', 'div.view_top_area .title', 'h1'],
      content: ['div.viewContent', 'div#wrap_body', 'div.contentBody'],
      images: 'img',
      removeElements: [
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.viewBox .addThis', '.viewBox .vote_area',
        '.ad_content', 'ins', '.comment_wrap',
        '.board_icon_mini', '.list_memo_count_span',
      ],
    },
    commentSelectors: {
      item: '.view_comment_list li',
      text: '.memo_text_wrap',
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
      title: ['div.post-tit-info h1', 'h1', 'div.tit-content h3'],
      content: ['#contentArea', 'div#contentArea', 'div.content'],
      images: 'img',
      removeElements: [
        'script', 'style', 'iframe:not([src*="youtube"])',
        '.posting-tool', '.posting-share', '.posting-ad',
        'ins', '.ad_area', '.comment_area', '.cmt_tit',
        '.emblem',
      ],
    },
    commentSelectors: {
      item: '.comment_area .comment_item',
      text: '.comment_cont',
    },
    headless: true,
    minDelay: 2000,
    cloudflareProtected: false,
  },
  {
    id: 'cook82',
    name: '82cook',
    urlPatterns: [/82cook\.com\/entiz\/read/],
    selectors: {
      title: ['h4.title.bbstitle span'],
      content: ['div#articleBody'],
      images: 'img',
      removeElements: [
        'script', 'style', '.ad_area', 'iframe:not([src*="youtube"])',
        'div.read_reple',
      ],
    },
    commentSelectors: {
      item: 'li.rp',
      text: 'p',
      author: 'h5 strong.user_function a',
    },
    postAuthorSelectors: ['div.readLeft strong.user_function.user_profile a'],
    headless: true,
    minDelay: 1500,
    cloudflareProtected: false,
  },
  {
    id: 'navercafe',
    name: '네이버 카페',
    urlPatterns: [/cafe\.naver\.com\/(f-e|ca-fe)\/cafes\//],
    selectors: {
      title: ['.title_text'],
      content: ['.article_viewer'],
      images: 'img',
      // iframe 전체 제거: 네이버 동영상 플레이어(naverVideoPlayer, kakaotv 등) 지원 제외
      removeElements: ['script', 'style', '.ad_area', 'iframe', '.ArticleTool'],
    },
    commentSelectors: {
      item: 'ul.comment_list li',
      text: '.text_comment',
      author: '.comment_nickname',
    },
    postAuthorSelectors: ['.WriterInfo .nickname'],
    requiresSession: true,
    contentFrame: 'cafe_main',
    headless: true,
    minDelay: 3000,
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
