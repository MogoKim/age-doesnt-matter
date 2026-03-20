'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface CommentResult {
  error?: string
}

export async function createComment(
  postId: string,
  content: string,
  parentId?: string,
): Promise<CommentResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const trimmed = content.trim()
  if (!trimmed) {
    return { error: '댓글 내용을 입력해 주세요' }
  }

  if (trimmed.length > 500) {
    return { error: '댓글은 500자 이내로 입력해 주세요' }
  }

  // 게시글 존재 확인
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: { id: true, boardType: true },
  })
  if (!post) {
    return { error: '존재하지 않는 게시글입니다' }
  }

  // 대댓글인 경우 부모 댓글 확인
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId, postId, status: 'ACTIVE' },
      select: { id: true, parentId: true },
    })
    if (!parent) {
      return { error: '존재하지 않는 댓글입니다' }
    }
    // 대대댓글 방지 (1단계만 허용)
    if (parent.parentId) {
      return { error: '대댓글에는 답글을 달 수 없습니다' }
    }
  }

  await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId,
        authorId: session.user.id,
        content: trimmed,
        parentId: parentId || null,
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { commentCount: { increment: 1 } },
    }),
  ])

  revalidatePath(`/community`)
  return {}
}
