'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
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
