import { prisma } from '@/lib/prisma'

type SectionKey = 'TRENDING' | 'STORIES' | 'HUMOR'

export interface CurationOverrideView {
  id: string
  postId: string
  postTitle: string
  postBoardType: string
  postThumbnailUrl: string | null
  action: 'PIN' | 'HIDE'
  position: number | null
  note: string | null
  expiresAt: string | null
  createdAt: string
  createdByNickname: string
}

export interface HomeCurationAdminView {
  TRENDING: { pins: CurationOverrideView[]; hides: CurationOverrideView[] }
  STORIES: { pins: CurationOverrideView[]; hides: CurationOverrideView[] }
  HUMOR: { pins: CurationOverrideView[]; hides: CurationOverrideView[] }
}

export async function getHomeCurationAdminView(): Promise<HomeCurationAdminView> {
  const now = new Date()

  const overrides = await prisma.homeCurationOverride.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      postId: true,
      section: true,
      action: true,
      position: true,
      note: true,
      expiresAt: true,
      createdAt: true,
      post: { select: { title: true, boardType: true, thumbnailUrl: true } },
      createdBy: { select: { nickname: true } },
    },
    orderBy: [{ section: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
  })

  type RawOverride = (typeof overrides)[0]

  const toView = (o: RawOverride): CurationOverrideView => ({
    id: o.id,
    postId: o.postId,
    postTitle: o.post.title,
    postBoardType: o.post.boardType,
    postThumbnailUrl: o.post.thumbnailUrl,
    action: o.action,
    position: o.position,
    note: o.note,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    createdByNickname: o.createdBy.nickname,
  })

  const bySection = (section: SectionKey, action: 'PIN' | 'HIDE') =>
    overrides.filter(o => o.section === section && o.action === action).map(toView)

  return {
    TRENDING: { pins: bySection('TRENDING', 'PIN'), hides: bySection('TRENDING', 'HIDE') },
    STORIES: { pins: bySection('STORIES', 'PIN'), hides: bySection('STORIES', 'HIDE') },
    HUMOR: { pins: bySection('HUMOR', 'PIN'), hides: bySection('HUMOR', 'HIDE') },
  }
}

// ── 베스트 편성 어드민 뷰 (BEST_HOT / BEST_FAME) ──

export interface BestCurationAdminView {
  BEST_HOT: { pins: CurationOverrideView[]; hides: CurationOverrideView[] }
  BEST_FAME: { pins: CurationOverrideView[]; hides: CurationOverrideView[] }
}

export async function getBestCurationAdminView(): Promise<BestCurationAdminView> {
  const now = new Date()

  const overrides = await prisma.homeCurationOverride.findMany({
    where: {
      section: { in: ['BEST_HOT', 'BEST_FAME'] },
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      postId: true,
      section: true,
      action: true,
      position: true,
      note: true,
      expiresAt: true,
      createdAt: true,
      post: { select: { title: true, boardType: true, thumbnailUrl: true } },
      createdBy: { select: { nickname: true } },
    },
    orderBy: [{ section: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
  })

  type RawOverride = (typeof overrides)[0]

  const toView = (o: RawOverride): CurationOverrideView => ({
    id: o.id,
    postId: o.postId,
    postTitle: o.post.title,
    postBoardType: o.post.boardType,
    postThumbnailUrl: o.post.thumbnailUrl,
    action: o.action,
    position: o.position,
    note: o.note,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    createdByNickname: o.createdBy.nickname,
  })

  const by = (section: 'BEST_HOT' | 'BEST_FAME', action: 'PIN' | 'HIDE') =>
    overrides.filter(o => o.section === section && o.action === action).map(toView)

  return {
    BEST_HOT: { pins: by('BEST_HOT', 'PIN'), hides: by('BEST_HOT', 'HIDE') },
    BEST_FAME: { pins: by('BEST_FAME', 'PIN'), hides: by('BEST_FAME', 'HIDE') },
  }
}

export interface PostSearchResult {
  id: string
  title: string
  boardType: string
  thumbnailUrl: string | null
  likeCount: number
  commentCount: number
  createdAt: string
  authorNickname: string
}

export async function searchHomeCurationPosts(
  query: string,
  limit = 20,
): Promise<PostSearchResult[]> {
  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      title: { contains: query, mode: 'insensitive' },
      boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
    },
    select: {
      id: true,
      title: true,
      boardType: true,
      thumbnailUrl: true,
      likeCount: true,
      commentCount: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
    orderBy: [{ trendingScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return posts.map(p => ({
    id: p.id,
    title: p.title,
    boardType: p.boardType,
    thumbnailUrl: p.thumbnailUrl,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    createdAt: p.createdAt.toISOString(),
    authorNickname: p.author?.nickname ?? '탈퇴한 회원',
  }))
}
