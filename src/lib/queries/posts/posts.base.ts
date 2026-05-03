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
} | null): UserSummary {
  if (!user) return DELETED_USER
  const grade = user.grade as Grade
  return {
    id: user.id,
    nickname: user.nickname,
    grade,
    gradeEmoji: GRADE_INFO[grade]?.emoji ?? '🌱',
    profileImage: user.profileImage,
  }
}

export function toPromotionLevel(level: PromotionLevel): PostSummaryK'promotionLevel'] {
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
  createdAt: true,
  slug: true,
  author: {
    select: { id: true, nickname: true, grade: true, profileImage: true },
  },
} as const

export function toPostSummary(
  post: {
    id: string
    boardType: BoardType
    category: string | null
    title: string
    summary: string | null
    thumbnailUrl: string | null
    isPinned?: boolean
    likeCount: number
    commentCount: number
    viewCount: number
    promotionLevel: PromotionLevel
    createdAt: Date
    slug?: string | null
    author: { id: string; nickname: string; grade: string; profileImage: string | null } | null
  },
): PostSummary {
  return {
    id: post.id,
    boardType: post.boardType,
    category: post.category ?? '',
    title: post.title,
    preview: post.summary ?? '',
    thumbnailUrl: post.thumbnailUrl,
    author: toUserSummary(post.author),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    promotionLevel: toPromotionLevel(post.promotionLevel),
    isPinned: post.isPinned ?? false,
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
  { revalidate: 60 },
)

/* ── 게시글 상세 ── */

export const getPostDetail = unstable_cache(
  async (postId: string): Promise<PostDetail | null> => {
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
      seriesId: post.seriesId ?? null,
      seriesTitle: post.seriesTitle ?? null,
      seriesOrder: post.seriesOrder ?? null,
      seriesCount: post.seriesCount ?? null,
      seasonId: post.seasonId ?? null,
    }
  },
  ['post-detail'],
  { revalidate: 30 },
)
