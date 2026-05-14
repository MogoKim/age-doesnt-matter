'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
import { checkAndPromotePost } from '@/lib/actions/promotion'
import type { PostStatus, PromotionLevel } from '@/generated/prisma/client'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// BoardType → 서비스 페이지 경로 매핑
const BOARD_PATHS: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
  WEEKLY: '/community/weekly',
}

/** 게시글 상태 변경 시 서비스 페이지 캐시 무효화 */
function revalidateServicePaths(boardType?: string | null, postId?: string) {
  const boardPath = boardType ? BOARD_PATHS[boardType] : null
  if (boardPath) {
    revalidatePath(boardPath)
    if (postId) revalidatePath(`${boardPath}/${postId}`)
  }
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
}

export async function adminSetPostPromotionLevel(postId: string, level: PromotionLevel) {
  const admin = await requireAdmin()

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { promotionLevel: true, boardType: true },
  })

  await prisma.post.update({
    where: { id: postId },
    data: { promotionLevel: level },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'PROMOTION_LEVEL_CHANGE',
      targetType: 'POST',
      targetId: postId,
      before: existing ? JSON.stringify({ promotionLevel: existing.promotionLevel }) : undefined,
      after: JSON.stringify({ promotionLevel: level }),
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
      before: JSON.stringify({ likeCount: post.likeCount }),
      after: JSON.stringify({ likeCount }),
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
      after: JSON.stringify({ count: ids.length, ids }),
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
      before: existing ? JSON.stringify({ status: existing.status }) : undefined,
      after: JSON.stringify({ status }),
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
      before: existing ? JSON.stringify({ isPinned: existing.isPinned }) : undefined,
      after: JSON.stringify({ isPinned }),
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
      before: existing ? JSON.stringify({ isFeatured: existing.isFeatured }) : undefined,
      after: JSON.stringify({ isFeatured }),
    },
  })

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
  data: { title: string; content: string }
) {
  await requireAdmin()
  const trimmedTitle = data.title.trim()
  if (!trimmedTitle) throw new Error('제목은 비워둘 수 없습니다')

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { boardType: true },
  })
  if (!post) throw new Error('게시글을 찾을 수 없습니다')

  await prisma.post.update({
    where: { id: postId },
    data: { title: trimmedTitle, content: data.content },
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
