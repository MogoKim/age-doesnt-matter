import type { CafeConfig } from './types.js'

/** 크롤링 대상 네이버 카페 3곳 */
export const CAFE_CONFIGS: CafeConfig[] = [
  {
    id: 'wgang',
    name: '우리가남이가',
    url: 'https://cafe.naver.com/wgang',
    numericId: 29349320,
    boards: [
      { name: '인기글', menuId: 'popular', maxPages: 2 },
      { name: '최신글', menuId: 'ArticleList', maxPages: 2 },
    ],
  },
  {
    id: 'welovesilver',
    name: '실버사랑',
    url: 'https://cafe.naver.com/welovesilver',
    numericId: 28648142,
    boards: [
      { name: '인기글', menuId: 'popular', maxPages: 2 },
      { name: '최신글', menuId: 'ArticleList', maxPages: 2 },
    ],
  },
  {
    id: '5060years',
    name: '5060세대',
    url: 'https://cafe.naver.com/5060years',
    numericId: 28962370,
    boards: [
      { name: '인기글', menuId: 'popular', maxPages: 2 },
      { name: '최신글', menuId: 'ArticleList', maxPages: 2 },
    ],
  },
]

/** Chrome 사용자 프로필 경로 (macOS) */
export const CHROME_USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ??
  `${process.env.HOME}/Library/Application Support/Google/Chrome`

export const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'Profile 1'

/** 크롤링 제한 */
export const CRAWL_LIMITS = {
  /** 카페당 최대 수집 글 수 */
  maxPostsPerCafe: 30,
  /** 본문 최대 길이 (자) */
  maxContentLength: 3000,
  /** 페이지 로드 대기 (ms) */
  pageTimeout: 15000,
  /** 글 간 딜레이 (ms) — 차단 방지 */
  delayBetweenPosts: 2000,
  /** 글 목록 간 딜레이 (ms) */
  delayBetweenPages: 3000,
}
