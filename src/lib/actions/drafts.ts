'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_DRAFTS = 5

interface DraftResult {
  error?: string
  draftId?: string
}

/** 임시저장 생성/업데이트 */
export async function saveDraft(draftId: string | null, formData: FormData): Promise<DraftResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const boardSlug = formData.get('boardSlug') as string || 'stories'
  const category = formData.get('category') as string || ''
  const title = (formData.get('title') as string || '').slice(0, 40)
  const content = formData.get('content') as string || ''

  // 기존 임시저장 업데이트
  if (draftId) {
    const existing = await prisma.draftPost.findUnique({
      where: { id: draftId },
      select: { authorId: true },
    })
    if (!existing || existing.authorId !== session.user.id) {
      return { error: '임시저장을 찾을 수 없습니다' }
    }

    await prisma.draftPost.update({
      where: { id: draftId },
      data: { boardSlug, category: category || null, title, content },
    })
    return { draftId }
  }

  // 새 임시저장 — 최대 5개 제한
  const count = await prisma.draftPost.count({
    where: { authorId: session.user.id },
  })

  if (count >= MAX_DRAFTS) {
    // 가장 오래된 것 삭제
    const oldest = await prisma.draftPost.findFirst({
      where: { authorId: session.user.id },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    })
    if (oldest) {
      await prisma.draftPost.delete({ where: { id: oldest.id } })
    }
  }

  const draft = await prisma.draftPost.create({
    data: {
      authorId: session.user.id,
      boardSlug,
      category: category || null,
      title,
      content,
    },
  })

  return { draftId: draft.id }
}

/** 임시저장 삭제 */
export async function deleteDraft(draftId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const existing = await prisma.draftPost.findUnique({
    where: { id: draftId },
    select: { authorId: true },
  })
  if (!existing || existing.authorId !== session.user.id) {
    return { error: '임시저장을 찾을 수 없습니다' }
  }

  await prisma.draftPost.delete({ where: { id: draftId } })
  return {}
}

/** 내 임시저장 목록 조회 */
export async function getMyDrafts() {
  const session = await auth()
  if (!session?.user?.id) return []

  return prisma.draftPost.findMany({
    where: { authorId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      boardSlug: true,
      category: true,
      title: true,
      updatedAt: true,
    },
  })
}
