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

export type Grade = 'SPROUT' | 'REGULAR' | 'VETERAN' | 'WARM_NEIGHBOR'

export const GRADE_EMOJI: Record<Grade, string> = {
  SPROUT: '🌱',
  REGULAR: '🌿',
  VETERAN: '💎',
  WARM_NEIGHBOR: '☀️',
}

export const GRADE_LABEL: Record<Grade, string> = {
  SPROUT: '새싹',
  REGULAR: '단골',
  VETERAN: '터줏대감',
  WARM_NEIGHBOR: '따뜻한이웃',
}

export const GRADE_ORDER: Record<Grade, number> = {
  SPROUT: 1,
  REGULAR: 2,
  VETERAN: 3,
  WARM_NEIGHBOR: 4,
}

// ── 게시판 ──

export type BoardType = 'JOB' | 'STORY' | 'HUMOR' | 'MAGAZINE' | 'WEEKLY'
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'DELETED'
export type PromotionLevel = 'NORMAL' | 'HOT' | 'HALL_OF_FAME'

/** URL slug ↔ Prisma BoardType 변환 */
export const BOARD_SLUG_MAP: Record<string, BoardType> = {
  stories: 'STORY',
  humor: 'HUMOR',
  magazine: 'MAGAZINE',
  jobs: 'JOB',
  weekly: 'WEEKLY',
}

export const BOARD_TYPE_TO_SLUG: Record<BoardType, string> = {
  STORY: 'stories',
  HUMOR: 'humor',
  MAGAZINE: 'magazine',
  JOB: 'jobs',
  WEEKLY: 'weekly',
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
  createdAt: string
}

export interface PostDetail extends PostSummary {
  content: string
  imageUrls: string[]
  youtubeUrl: string | null
  isLiked: boolean
  isScrapped: boolean
  updatedAt: string
}

export interface CommentItem {
  id: string
  content: string
  author: UserSummary | null
  likeCount: number
  isLiked: boolean
  isDeleted: boolean
  createdAt: string
  replies: CommentItem[]
}

export type NotificationType =
  | 'COMMENT'
  | 'LIKE'
  | 'GRADE_UP'
  | 'SYSTEM'
  | 'POST_STATUS'

export interface NotificationItem {
  id: string
  type: NotificationType
  message: string
  linkUrl: string
  isRead: boolean
  createdAt: string
}
