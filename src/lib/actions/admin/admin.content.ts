'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
import { checkAndPromotePost } from '@/lib/actions/promotion'
import type { PostStatus, PromotionLevel, BoardType } from '@/generated/prisma/client'
import { assertGreetingByMember } from '@/lib/greeting'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// 1차 이동 허용 게시판 (MAGAZINE/JOB/WEEKLY는 별도 영향도 검토 필요)
const MOVABLE_BOARD_TYPES: BoardType[] = ['STORY', 'LIFE2', 'HUMOR', 'MENOPAUSE']

// BoardType → 서비스 페이지 경로 매핑 (SSoT: board-registry — 구 로컬 중복 정의 제거)
const BOARD_PATHS: Record<string, string> = BOARD_URL_PREFIX

/** 게시글 상태 변경 시 서비스 페이지 캐시 무효화 */
function revalidateServicePaths(boardType?: string | null, postIdentifier?: string | null) {
  const boardPath = boardType ? BOARD_PATHS[boardType] : null
  if (boardPath) {
    revalidatePath(boardPath)
    if (postIdentifier) revalidatePath(`${boardPath}/${postIdentifier}`)
  }
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
}

export async function adminSetPostPromotionLevel(postId: string, level: PromotionLevel) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { promotionLevel: true, boardType: true, hotPromotedAt: true },
  })

  // 어드민 수동 설정도 hotPromotedAt 불변성 규칙을 따른다.
  // NORMAL 강등 시 hotPromotedAt 건드리지 않음 — 뜨는이야기 영구 잔류 유지.
  await prisma.post.update({
    where: { id: postId },
    data: {
      promotionLevel: level,
      ...(level !== 'NORMAL' && !existing?.hotPromotedAt
        ? { hotPromotedAt: new Date() }
        : {}),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'PROMOTION_LEVEL_CHANGE',
      targetType: 'POST',
      targetId: postId,
      before: existing ? { promotionLevel: existing.promotionLevel } : undefined,
      after: { promotionLevel: level },
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
  revalidatePath('/best')
}

export async function adminSetPostLikeCount(postId: string, likeCount: number) {
  const admin = await requireAdmin()
  if (!Number.isInteger(likeCount) || likeCount < 0) {
    throw new Error('유효하지 않은 좋아요 수입니다.')
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { likeCount: true, commentCount: true, boardType: true },
  })
  if (!post) throw new Error('게시글을 찾을 수 없습니다.')

  await prisma.post.update({ where: { id: postId }, data: { likeCount } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'POST_LIKE_COUNT_SET',
      targetType: 'POST',
      targetId: postId,
      before: { likeCount: post.likeCount },
      after: { likeCount },
    },
  })

  void checkAndPromotePost(postId, post.boardType, likeCount, post.commentCount).catch(() => {})

  revalidateServicePaths(post.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminBulkDeleteExpiredJobs() {
  const admin = await requireAdmin()
  const now = new Date()

  const expiredJobs = await prisma.post.findMany({
    where: {
      boardType: 'JOB',
      status: 'PUBLISHED',
      jobDetail: { expiresAt: { lt: now } },
    },
    select: { id: true },
  })

  if (expiredJobs.length === 0) return { deleted: 0 }

  const ids = expiredJobs.map((j) => j.id)
  await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: { status: 'HIDDEN' },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BULK_EXPIRE_JOBS',
      targetType: 'POST',
      targetId: 'bulk',
      after: { count: ids.length, ids },
      note: `만료 일자리 ${ids.length}건 숨김 처리`,
    },
  })

  revalidateServicePaths('JOB')
  revalidatePath('/admin/content')
  return { deleted: ids.length }
}

// ⚠️ RESTRICT 제약 주의: Report.postId / Report.commentId 가 onDelete: Restrict 로 설정됨
// 만약 prisma.post.delete() 또는 prisma.comment.delete() (하드 삭제) 를 추가할 경우
// 먼저 해당 post/comment의 Report를 삭제하거나 Report.postId/commentId 를 null 로 업데이트해야 함
// 현재 이 파일의 모든 삭제는 소프트 삭제(status 변경)이므로 영향 없음
export async function adminUpdatePostStatus(postId: string, status: PostStatus) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({ where: { id: postId } })

  await prisma.post.update({
    where: { id: postId },
    data: { status },
  })

  // DELETED 처리 시 R2 썸네일 삭제 (best-effort)
  if (status === 'DELETED' && existing?.thumbnailUrl) {
    const key = extractR2KeyFromUrl(existing.thumbnailUrl)
    if (key) await deleteFromR2(key).catch(() => {})
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: `POST_${status}`,
      targetType: 'POST',
      targetId: postId,
      before: existing ? { status: existing.status } : undefined,
      after: { status },
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminTogglePin(postId: string, isPinned: boolean) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({ where: { id: postId } })

  await prisma.post.update({
    where: { id: postId },
    data: { isPinned },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isPinned ? 'POST_PIN' : 'POST_UNPIN',
      targetType: 'POST',
      targetId: postId,
      before: existing ? { isPinned: existing.isPinned } : undefined,
      after: { isPinned },
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminToggleFeatured(postId: string, isFeatured: boolean) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({ where: { id: postId } })

  await prisma.post.update({
    where: { id: postId },
    data: {
      isFeatured,
      featuredAt: isFeatured ? new Date() : null,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isFeatured ? 'POST_FEATURED_ON' : 'POST_FEATURED_OFF',
      targetType: 'POST',
      targetId: postId,
      before: existing ? { isFeatured: existing.isFeatured } : undefined,
      after: { isFeatured },
    },
  })

  revalidateServicePaths(existing?.boardType, postId)
  revalidatePath('/admin/content')
}

export async function adminBulkAction(
  postIds: string[],
  action: 'HIDDEN' | 'DELETED'
) {
  const admin = await requireAdmin()

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { id: true, boardType: true, thumbnailUrl: true },
  })

  await prisma.post.updateMany({
    where: { id: { in: postIds } },
    data: { status: action },
  })

  for (const postId of postIds) {
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.adminId,
        action: `BULK_${action}`,
        targetType: 'POST',
        targetId: postId,
      },
    })
  }

  // DELETED 처리 시 R2 썸네일 삭제 (best-effort)
  if (action === 'DELETED') {
    for (const post of posts) {
      if (post.thumbnailUrl) {
        const key = extractR2KeyFromUrl(post.thumbnailUrl)
        if (key) await deleteFromR2(key).catch(() => {})
      }
    }
  }

  // 게시판별 목록 캐시 무효화
  const boardTypes = [...new Set(posts.map((p) => p.boardType))]
  for (const bt of boardTypes) revalidateServicePaths(bt)

  // 각 글 상세 페이지 SSG 캐시 명시적 무효화
  for (const { id: pid, boardType: bt } of posts) {
    const bp = BOARD_PATHS[bt]
    if (bp) revalidatePath(`${bp}/${pid}`)
  }

  revalidatePath('/admin/content')
}

export async function adminUpdatePostContent(
  postId: string,
  data: { title: string; content: string; seoTitle?: string; seoDescription?: string }
) {
  await requireAdmin()
  const trimmedTitle = data.title.trim()
  if (!trimmedTitle) throw new Error('제목은 비워둘 수 없습니다')

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { boardType: true },
  })
  if (!post) throw new Error('게시글을 찾을 수 없습니다')

  // SEO 메타: 필드가 전달됐을 때만 갱신. 빈 문자열/공백 → null(구글이 본문 스니펫 자동생성).
  // undefined(폼에서 미전달)면 update data에서 제외해 기존값 유지.
  const seoTitle = data.seoTitle === undefined ? undefined : (data.seoTitle.trim() || null)
  const seoDescription = data.seoDescription === undefined ? undefined : (data.seoDescription.trim() || null)

  await prisma.post.update({
    where: { id: postId },
    data: {
      title: trimmedTitle,
      content: data.content,
      ...(seoTitle !== undefined ? { seoTitle } : {}),
      ...(seoDescription !== undefined ? { seoDescription } : {}),
    },
  })

  revalidatePath(`/admin/content/${postId}`)
  revalidateServicePaths(post.boardType, postId)
}

export async function adminUpdateComment(commentId: string, content: string) {
  await requireAdmin()
  const trimmed = content.trim()
  if (!trimmed) throw new Error('댓글 내용은 비워둘 수 없습니다')

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { postId: true, post: { select: { boardType: true } } },
  })
  if (!comment) throw new Error('댓글을 찾을 수 없습니다')

  await prisma.comment.update({ where: { id: commentId }, data: { content: trimmed } })

  revalidatePath(`/admin/content/${comment.postId}`)
  const boardPath = BOARD_PATHS[comment.post.boardType]
  if (boardPath) revalidatePath(`${boardPath}/${comment.postId}`)
}

export async function adminDeleteComment(commentId: string) {
  await requireAdmin()

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { postId: true, status: true, post: { select: { boardType: true } } },
  })
  if (!comment || comment.status === 'DELETED') return

  await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { status: 'DELETED' } }),
    prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }),
  ])

  revalidatePath('/admin/content')
  revalidatePath(`/admin/content/${comment.postId}`)
  const boardPath = BOARD_PATHS[comment.post.boardType]
  if (boardPath) revalidatePath(`${boardPath}/${comment.postId}`)
}

export async function adminMovePost(
  postId: string,
  boardType: BoardType,
  category: string | null
) {
  const admin = await requireAdmin()

  // 1차: 운영 검증된 커뮤니티 보드만 허용
  if (!MOVABLE_BOARD_TYPES.includes(boardType)) {
    throw new Error('이동할 수 없는 게시판입니다. (STORY / LIFE2 / HUMOR / MENOPAUSE만 가능)')
  }

  // category 정규화: '' | '전체' → null
  const normalizedCategory = !category || category === '전체' ? null : category

  // category 유효성: 대상 게시판 BoardConfig.categories에 포함 여부
  if (normalizedCategory) {
    const config = await prisma.boardConfig.findUnique({
      where: { boardType },
      select: { categories: true },
    })
    const validCategories = (config?.categories ?? []) as string[]
    if (!validCategories.includes(normalizedCategory)) {
      throw new Error(`유효하지 않은 카테고리입니다: ${normalizedCategory}`)
    }
  }

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { boardType: true, category: true, source: true, slug: true },
  })
  if (!existing) throw new Error('게시글을 찾을 수 없습니다.')

  // '가입인사'는 회원 첫 참여 온보딩 전용 — BOT/SHEET/ADMIN 글을 가입인사 category로 이동 차단(회원 글만 허용)
  assertGreetingByMember(normalizedCategory, existing.source)

  await prisma.post.update({
    where: { id: postId },
    data: { boardType, category: normalizedCategory },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'POST_MOVE',
      targetType: 'POST',
      targetId: postId,
      before: { boardType: existing.boardType, category: existing.category },
      after: { boardType, category: normalizedCategory },
    },
  })

  // 이전 게시판 + 새 게시판 revalidation.
  // 상세 공개 URL은 slug이므로 id와 slug를 모두 무효화해야 이동 직후 정본 보드가 맞는다.
  const postIdentifiers = Array.from(new Set([postId, existing.slug].filter(Boolean)))
  for (const identifier of postIdentifiers) {
    revalidateServicePaths(existing.boardType, identifier)
    revalidateServicePaths(boardType, identifier)
  }
  revalidatePath('/admin/content')
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
  revalidateTag('post-detail')
  revalidateTag('post-meta')
  revalidateTag('home-trending')
  revalidateTag('home-stories')
  revalidateTag('home-humor')
  revalidateTag('community-board-page')
}
