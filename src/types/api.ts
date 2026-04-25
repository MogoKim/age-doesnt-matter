/* API 공통 타입 — API_CONTRACT.md 기준 */

// ── 응답 래퍼 ──

export interface ApiSuccessResponse<T> {
  ok: true
  data: T
  meta?: PaginationMeta
}

export interface ApiErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    details?: Array<{ field: string; message: string; [key: string]: unknown }>
  }
}

export type ApiResult<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface PaginationMeta {
  total: number
  cursor: string | null
  hasMore: boolean
}

// ── 페이지네이션 요청 ──

export interface CursorParams {
  cursor?: string
  limit?: number
}

// ── 등급 ──

export type Grade = 'SPROUT' | 'REGULAR' | 'WARM_NEIGHBOR' | 'HONORARY'

export const GRADE_EMOJI: Record<Grade, string> = {
  SPROUT: '🌱',
  REGULAR: '🌿',
  WARM_NEIGHBOR: '☀️',
  HONORARY: '🏅',
}

export const GRADE_LABEL: Record<Grade, string> = {
  SPROUT: '새싹',
  REGULAR: '단골',
  WARM_NEIGHBOR: '따뜻한이웃',
  HONORARY: '명예우나어인',
}

export const GRADE_ORDER: Record<Grade, number> = {
  SPROUT: 1,
  REGULAR: 2,
  WARM_NEIGHBOR: 3,
  HONORARY: 4,
}

// ── 게시판 ──

export type BoardType = 'JOB' | 'STORY' | 'HUMOR' | 'MAGAZINE' | 'WEEKLY' | 'LIFE2'
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'DELETED'
export type PromotionLevel = 'NORMAL' | 'HOT' | 'HALL_OF_FAME'

/** URL slug ↔ Prisma BoardType 변환 */
export const BOARD_SLUG_MAP: Record<string, BoardType> = {
  stories: 'STORY',
  humor: 'HUMOR',
  magazine: 'MAGAZINE',
  jobs: 'JOB',
  weekly: 'WEEKLY',
  life2: 'LIFE2',
}

export const BOARD_TYPE_TO_SLUG: Record<BoardType, string> = {
  STORY: 'stories',
  HUMOR: 'humor',
  MAGAZINE: 'magazine',
  JOB: 'jobs',
  WEEKLY: 'weekly',
  LIFE2: 'life2',
}

// ── 리소스 타입 ──

export interface UserSummary {
  id: string
  nickname: string
  grade: Grade
  gradeEmoji: string
  profileImage: string | null
}

export interface PostSummary {
  id: string
  boardType: BoardType
  category: string
  title: string
  preview: string
  thumbnailUrl: string | null
  author: UserSummary
  likeCount: number
  commentCount: number
  viewCount: number
  promotionLevel: PromotionLevel
  isPinned?: boolean
  createdAt: string
  slug?: string | null
}

export interface PostDetail extends PostSummary {
  content: string
  imageUrls: string[]
  youtubeUrl: string | null
  isLiked: boolean
  isScrapped: boolean
  updatedAt: string
  slug: string | null
  seoTitle: string | null
  seoDescription: string | null
  // 시리즈 (매거진 연재)
  seriesId: string | null
  seriesTitle: string | null
  seriesOrder: number | null
  seriesCount: number | null
  seasonId: string | null
}

export interface CommentItem {
  id: string
  content: string
  author: UserSummary | null
  likeCount: number
  isLiked: boolean
  isDeleted: boolean
  isOwn: boolean
  canEdit: boolean
  createdAt: string
  replies: CommentItem[]
}

export type NotificationType =
  | 'COMMENT'
  | 'LIKE'
  | 'GRADE_UP'
  | 'SYSTEM'
  | 'CONTENT_HIDDEN'

export interface NotificationItem {
  id: string
  type: NotificationType
  message: string
  linkUrl: string
  isRead: boolean
  createdAt: string
}
