import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import { GRADE_INFO } from '@/lib/grade'
import type { PostSummary, PostDetail, UserSummary, Grade } from '@/types/api'

/* ── 헬퍼 ── */

export const DELETED_USER: UserSummary = {
  id: '',
  nickname: '탈퇴한 회원',
  grade: 'SEED' as Grade,
  gradeEmoji: '🌱',
  profileImage: null,
}

export function toUserSummary(user: {
  id: string
  nickname: string
  grade: string
  profileImage: string | null
  status?: string
} | null): UserSummary {
  if (!user) return DELETED_USER
  // 탈퇴(익명화) 회원은 저장된 익명 닉네임 대신 '탈퇴한 회원'으로 표시 마스킹
  if (user.status === 'WITHDRAWN') return DELETED_USER
  const grade = user.grade as Grade
  return {
    id: user.id,
    nickname: user.nickname,
    grade,
    gradeEmoji: GRADE_INFO[grade]?.emoji ?? '🌱',
    profileImage: user.profileImage,
  }
}

export function toPromotionLevel(level: PromotionLevel): PostSummary['promotionLevel'] {
  if (level === 'HALL_OF_FAME') return 'HALL_OF_FAME'
  return level
}

export const postSelect = {
  id: true,
  boardType: true,
  category: true,
  title: true,
  summary: true,
  thumbnailUrl: true,
  isPinned: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  promotionLevel: true,
  trendingScore: true,
  createdAt: true,
  slug: true,
  author: {
    select: { id: true, nickname: true, grade: true, profileImage: true, status: true },
  },
} as const

/**
 * 홈 섹션(지금뜨는이야기/사는이야기/웃음방) 전용 축소 select.
 * 홈 카드는 썸네일 없는 텍스트 리스트(순위+제목+카테고리칩+댓글/조회수)만 렌더하므로
 * summary(최대 500자)·thumbnailUrl·author(JOIN)·category·isPinned를 제외해 HTML 페이로드 축소.
 * likeCount/commentCount/viewCount/createdAt은 calculateTrendingScore 재정렬 입력이라 유지.
 * toPostSummary가 누락 필드를 기본값(''/null/DELETED_USER)으로 채워 PostSummary 타입 만족.
 * [주의] author/썸네일을 표시하는 화면에 이 select를 쓰면 안 됨 — 홈 섹션 전용.
 */
export const homeListSelect = {
  id: true,
  boardType: true,
  title: true,
  slug: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  promotionLevel: true,
  trendingScore: true,
  createdAt: true,
} as const

export function toPostSummary(
  post: {
    id: string
    boardType: BoardType
    category?: string | null      // optional — homeListSelect 미포함 시 '' 기본값
    title: string
    summary?: string | null       // optional — homeListSelect 미포함 시 '' 기본값
    thumbnailUrl?: string | null  // optional — homeListSelect 미포함 시 null 기본값
    isPinned?: boolean
    likeCount: number
    commentCount: number
    viewCount: number
    promotionLevel: PromotionLevel
    trendingScore: number
    createdAt: Date
    slug?: string | null
    author?: { id: string; nickname: string; grade: string; profileImage: string | null } | null  // optional — 미포함 시 DELETED_USER
    hotPromotedAt?: Date | null  // optional — 기존 7개 호출부 무변경
  },
): PostSummary {
  return {
    id: post.id,
    boardType: post.boardType,
    category: post.category ?? '',
    title: post.title,
    preview: post.summary ?? '',
    thumbnailUrl: post.thumbnailUrl ?? null,
    author: toUserSummary(post.author ?? null),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    promotionLevel: toPromotionLevel(post.promotionLevel),
    hotPromotedAt: post.hotPromotedAt?.toISOString() ?? null,
    isPinned: post.isPinned ?? false,
    trendingScore: post.trendingScore,
    createdAt: post.createdAt.toISOString(),
    slug: post.slug ?? null,
  }
}

/* ── 텍스트 검색 조건 빌더 ── */

export type SearchField = 'both' | 'title' | 'content'

export function buildTextSearch(
  q?: string,
  sf: SearchField = 'both',
): { OR?: { title?: { contains: string; mode: 'insensitive' }; content?: { contains: string; mode: 'insensitive' } }[] } {
  if (!q?.trim()) return {}
  const keyword = q.trim()
  const OR: { title?: { contains: string; mode: 'insensitive' }; content?: { contains: string; mode: 'insensitive' } }[] = []
  if (sf === 'both' || sf === 'title') OR.push({ title: { contains: keyword, mode: 'insensitive' } })
  if (sf === 'both' || sf === 'content') OR.push({ content: { contains: keyword, mode: 'insensitive' } })
  return { OR }
}

/* ── 메타데이터 전용 경량 조회 (generateMetadata에서 사용) ── */

export const getPostMeta = unstable_cache(
  async (postId: string) => {
    return prisma.post.findFirst({
      where: {
        status: { in: ['PUBLISHED', 'SEO_ONLY'] },
        OR: [{ id: postId }, { slug: postId }],
      },
      select: {
        title: true,
        summary: true,
        thumbnailUrl: true,
        slug: true,
        seoTitle: true,
        seoDescription: true,
      },
    })
  },
  ['post-meta'],
  { revalidate: 60, tags: ['post-meta'] },
)

/* ── 게시글 상세 ── */

function cacheTagToken(value: string): string {
  if (/^[A-Za-z0-9:_-]+$/.test(value) && value.length <= 120) return value

  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5 ^ value.length
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 16777619)
    h2 = Math.imul(h2 ^ code, 2246822519)
  }
  return `${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}

/**
 * 글 단위 상세 캐시 태그.
 *
 * 전역 태그 'post-detail'은 유지한다 — 관리자 콘텐츠 처리(admin.content.ts)와 글 수정·삭제
 * (actions/posts.ts)가 이 태그로 광역 무효화를 하고 있고, 숨김 글이 계속 노출되면 안 되기 때문이다.
 * 반면 댓글 쓰기처럼 "그 글 하나만" 바뀌는 경로는 이 글 단위 태그만 무효화한다.
 *
 * ⚠️ 인자는 CUID일 수도 slug일 수도 있다 — 상세 페이지는 정본 URL(slug)로,
 * opengraph-image·/api/posts/[postId]는 CUID로 호출한다. 즉 한 글이 두 개의 캐시 엔트리를
 * 가질 수 있으므로, 무효화하는 쪽에서 두 키의 태그를 모두 지워야 한다.
 *
 * Next는 캐시 태그를 x-next-cache-tags 헤더에 싣기 때문에 한글 slug를 그대로 태그에 넣으면
 * ERR_INVALID_CHAR 500이 난다. 태그 값은 ASCII 안전 토큰으로 정규화한다.
 */
export function postDetailCacheTag(postIdOrSlug: string): string {
  return `post-detail-${cacheTagToken(postIdOrSlug)}`
}

async function _getPostDetail(postId: string): Promise<PostDetail | null> {
  // id(CUID) 또는 slug 어느 쪽으로 접근해도 단일 쿼리로 조회
  const post = await prisma.post.findFirst({
    where: {
      status: { in: ['PUBLISHED', 'SEO_ONLY'] },
      OR: [{ id: postId }, { slug: postId }],
    },
    select: {
      ...postSelect,
      content: true,
      updatedAt: true,
      slug: true,
      seoTitle: true,
      seoDescription: true,
      seriesId: true,
      seriesTitle: true,
      seriesOrder: true,
      seriesCount: true,
      seasonId: true,
      // Google 전용 색인 판정(E0)의 입력 — 작성 주체별 분량 기준이 달라진다
      source: true,
    },
  })

  if (!post) return null

  // 조회수 증가 (fire-and-forget, 캐시 miss 시만 실행)
  prisma.post.update({
    where: { id: post.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {})

  return {
    ...toPostSummary(post),
    content: post.content,
    imageUrls: [],
    youtubeUrl: null,
    isLiked: false,
    isScrapped: false,
    updatedAt: post.updatedAt.toISOString(),
    slug: post.slug ?? null,
    seoTitle: post.seoTitle ?? null,
    seoDescription: post.seoDescription ?? null,
    source: post.source,
    seriesId: post.seriesId ?? null,
    seriesTitle: post.seriesTitle ?? null,
    seriesOrder: post.seriesOrder ?? null,
    seriesCount: post.seriesCount ?? null,
    seasonId: post.seasonId ?? null,
  }
}

/**
 * TTL 30s → 300s. 짧은 TTL로 즉시성을 떠받치던 구조를 글 단위 태그 무효화로 옮긴 것이다 —
 * 댓글·글 수정 시 해당 글 태그가 즉시 무효화되므로 TTL은 "아무도 안 건드린 글"의 상한일 뿐이다.
 */
export function getPostDetail(postId: string): Promise<PostDetail | null> {
  return unstable_cache(
    _getPostDetail,
    ['post-detail', postId],
    { revalidate: 300, tags: ['post-detail', postDetailCacheTag(postId)] },
  )(postId)
}
