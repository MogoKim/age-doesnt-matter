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
  /** 전체글보기 URL (V6 — allArticles 방식) */
  allArticlesUrl?: string
  /** true면 board 루프 방식 사용 (R02 롤백 feature flag) */
  legacyCrawler?: boolean
  /** 수집할 게시판 경로 (인기글, 최신글 등) */
  boards: CafeBoardConfig[]
  /**
   * 소스 스테이지 사다리 (production > core > publishable > shadow).
   * 'production'(기본, 미지정 포함): 발행 + killer 후보 + trend + CRAWL_EXPECTED 성공판정 전부.
   * 'core'(Phase 2-a): 발행 + killer 후보 경쟁 동급 — trend/성공판정은 미편입(Phase 2-b 이후).
   * 'publishable'(Phase 1-a): 발행(refs)만 + 보충 lane — 신규 카페 온보딩 단계.
   * 'shadow': 크롤·저장·psych 분석만 하고 발행 경로에서 격리(관찰 전용).
   * 크롤 전략(페이지 루프·연령필터)은 별개 축 — core/publishable/shadow 모두 SECONDARY 유지.
   * 정책 문서: docs/analysis/content-curate-phase2-core-promotion-design-2026-07-10.md
   */
  sourceStage?: 'production' | 'core' | 'publishable' | 'shadow'
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
  articleId?: number  // 네이버 게시글 순차 번호 (전체글보기 dedup용, 없으면 NULL)
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
  area?: string  // AI 프롬프트 및 aggregateKillerTopics에서 채움 (content-curator 미사용, 로그/디버깅용)
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

// ── 댓글 분석 유틸 ──

/** topComments Json? → CommentData[] 안전 파싱 (null/이형 데이터 방어) */
export function parseTopComments(raw: unknown): CommentData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(c => typeof c?.content === 'string' && c.content.length > 0)
    .map(c => ({
      author:    String(c.author ?? '익명'),
      content:   String(c.content).replace(/<[^>]+>/g, '').replace(/&[a-zA-Z]+;/g, '').trim(),
      likeCount: typeof c.likeCount === 'number' ? Math.max(0, c.likeCount) : 0,
      replies:   Array.isArray(c.replies)
        ? c.replies
            .filter((r: unknown) => typeof (r as { content?: unknown })?.content === 'string' && (r as { content: string }).content.length > 0)
            .map((r: { author?: unknown; content: string }) => ({
              author:  String(r.author ?? '익명'),
              content: String(r.content).replace(/<[^>]+>/g, '').trim(),
            }))
        : [],
    }))
}

export type CommentAtmosphere = '공감형' | '논쟁형' | '정보형' | '유머형' | '알수없음'

/** 댓글 분위기 분류 (rule-based, AI 호출 없음) */
export function classifyCommentAtmosphere(comments: CommentData[]): CommentAtmosphere {
  if (comments.length === 0) return '알수없음'
  const avgLike   = comments.reduce((s, c) => s + c.likeCount, 0) / comments.length
  const replyRate = comments.filter(c => c.replies.length >= 2).length / comments.length
  const hasInfo   = comments.some(c => /추천|방법|해보|어디/.test(c.content))
  const hasLaugh  = comments.some(c => /ㅋ|ㅎㅎ|웃/.test(c.content))
  if (replyRate >= 0.4)        return '논쟁형'
  if (hasInfo && avgLike > 15) return '정보형'
  if (hasLaugh && avgLike > 5) return '유머형'
  if (avgLike > 10)            return '공감형'
  return '알수없음'
}
