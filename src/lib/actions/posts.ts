'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BOARD_SLUG_MAP, BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType } from '@/generated/prisma/client'
import { checkBannedWords } from '@/lib/banned-words'

interface CreatePostResult {
  error?: string
}

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  const boardSlug = formData.get('boardSlug') as string
  const category = formData.get('category') as string | null
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()

  // 유효성 검사
  if (!boardSlug || !title || !content) {
    return { error: '필수 항목을 모두 입력해 주세요' }
  }

  const boardType = BOARD_SLUG_MAP[boardSlug] as BoardType | undefined
  if (!boardType) {
    return { error: '존재하지 않는 게시판입니다' }
  }

  if (title.length < 2 || title.length > 40) {
    return { error: '제목은 2~40자로 입력해 주세요' }
  }

  if (content.length < 10) {
    return { error: '본문은 10자 이상 입력해 주세요' }
  }

  // 금지어 검사
  const bannedInTitle = await checkBannedWords(title)
  if (bannedInTitle) {
    return { error: `제목에 사용할 수 없는 표현이 포함되어 있습니다.` }
  }
  const bannedInContent = await checkBannedWords(content)
  if (bannedInContent) {
    return { error: `본문에 사용할 수 없는 표현이 포함되어 있습니다.` }
  }

  // 게시판 활성 여부 확인
  const boardConfig = await prisma.boardConfig.findUnique({
    where: { boardType },
  })
  if (!boardConfig?.isActive) {
    return { error: '현재 글을 작성할 수 없는 게시판입니다' }
  }

  // 카테고리 유효성 확인
  if (category && !boardConfig.categories.includes(category)) {
    return { error: '유효하지 않은 카테고리입니다' }
  }

  // 게시글 생성
  const summary = content.replace(/<[^>]*>/g, '').slice(0, 100)

  const post = await prisma.post.create({
    data: {
      boardType,
      category: category || null,
      title,
      content: `<p>${content.replace(/\n/g, '</p><p>')}</p>`,
      summary,
      authorId: session.user.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  // 작성자 postCount 증가
  await prisma.user.update({
    where: { id: session.user.id },
    data: { postCount: { increment: 1 } },
  })

  const slug = BOARD_TYPE_TO_SLUG[boardType]
  revalidatePath(`/community/${slug}`)
  revalidatePath('/')
  redirect(`/community/${slug}/${post.id}`)
}
