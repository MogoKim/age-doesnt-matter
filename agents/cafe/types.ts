/** 카페 크롤링 & 트렌드 분석 타입 정의 */

/** 크롤링 대상 카페 설정 */
export interface CafeConfig {
  id: string        // wgang, welovesilver, 5060years
  name: string      // 한글 카페명
  url: string       // 카페 URL
  numericId: number // 네이버 내부 카페 숫자 ID (URL에서 추출)
  /** 수집할 게시판 경로 (인기글, 최신글 등) */
  boards: CafeBoardConfig[]
}

export interface CafeBoardConfig {
  name: string      // 게시판 이름
  menuId: string    // 네이버 카페 menuId
  maxPages: number  // 수집할 페이지 수
}

/** 크롤링된 원본 게시글 */
export interface RawCafePost {
  cafeId: string
  cafeName: string
  postUrl: string
  title: string
  content: string
  author: string
  category: string | null
  likeCount: number
  commentCount: number
  viewCount: number
  postedAt: Date
}

/** AI 분석된 트렌드 */
export interface TrendAnalysis {
  hotTopics: HotTopic[]
  keywords: KeywordEntry[]
  sentimentMap: SentimentMap
  magazineTopics: MagazineSuggestion[]
  personaHints: PersonaHint[]
}

export interface HotTopic {
  topic: string
  count: number
  sentiment: string
  examples: string[]
}

export interface KeywordEntry {
  word: string
  frequency: number
}

export interface SentimentMap {
  positive: number
  neutral: number
  negative: number
}

export interface MagazineSuggestion {
  title: string
  reason: string
  score: number
  relatedPosts: string[]
}

export interface PersonaHint {
  type: string       // 관심사 유형 (텃밭, 건강, 요리 등)
  description: string
  examplePosts: string[]
}

/** 큐레이션된 콘텐츠 (우나어에 게시할 글) */
export interface CuratedContent {
  personaId: string
  title: string
  content: string
  boardType: string
  category?: string    // 게시 카테고리 (일상/건강/고민/자녀/기타)
  sourceTopic: string  // 원본 트렌드 주제
  sourcePostIds: string[] // 참고한 CafePost IDs
}
