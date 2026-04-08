/** 카페 크롤링 & 트렌드 분석 타입 정의 */

// ── 게시판 우선순위 & 카테고리 ──

export type BoardPriority = 'high' | 'medium' | 'skip'
export type ContentCategory = 'health' | 'hobby' | 'food' | 'humor' | 'lifestyle' | 'job' | 'finance' | 'general'

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
  name: string             // 게시판 이름
  menuId: number           // 네이버 카페 menuId (숫자) — isPopular=true이면 무시
  maxPages: number         // 수집할 페이지 수
  priority: BoardPriority  // 크롤링 우선순위
  category: ContentCategory // 콘텐츠 카테고리
  isPopular?: boolean      // true이면 /popular URL 사용 (커뮤니티 인기글 수집)
}

/** 댓글 데이터 (대댓글 포함) */
export interface CommentData {
  author: string
  content: string
  likeCount: number
  replies: Array<{ author: string; content: string }>  // 대댓글
}

/** 말투 분석 결과 */
export interface SpeechTone {
  formality: 'formal' | 'casual' | 'mixed'  // 존댓말/반말/혼용
  emotionalIntensity: 'high' | 'medium' | 'low'
  keyPhrases: string[]     // 대표 표현 최대 5개 ("어머 진짜요?", "그러게 말이에요")
  communityVocab: string[] // 커뮤니티 특화 어휘 ("우리 나이", "갱년기야", "언니들")
}

/** 크롤링된 원본 게시글 */
export interface RawCafePost {
  cafeId: string
  cafeName: string
  postUrl: string
  title: string
  content: string
  author: string
  category: string | null      // 원본 카페 게시판명 (크롤링 시 추출)
  boardName: string | null     // config에서 설정한 게시판명
  boardCategory: ContentCategory | null  // config에서 설정한 카테고리
  likeCount: number
  commentCount: number
  viewCount: number
  postedAt: Date
  dateParseFailure?: boolean   // true이면 날짜 파싱 실패 → recency 점수 0으로 처리
  // 미디어
  imageUrls: string[]
  videoUrls: string[]
  thumbnailUrl: string | null
  // DEEP 모드: 상위 댓글 (최대 15개, 대댓글 포함)
  topComments?: CommentData[]
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
