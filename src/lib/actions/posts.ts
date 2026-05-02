'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BOARD_SLUG_MAP, BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType } from '@/generated/prisma/client'
import { checkBannedWords } from '@/lib/banned-words'
import { sanitizeHtml, stripHtmlTags } from '@/lib/sanitize'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
import { checkAndPromote } from '@/lib/grade'
import { generateCommunitySlug } from '@/lib/seo/slug'

interface CreatePostResult {
  error?: string
  postUrl?: string
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
  const imageUrls = formData.getAll('imageUrls') as string[]

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

  if (stripHtmlTags(content).trim().length < 10) {
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

  // 이미지 URL 검증 — 허용된 호스트만
  if (imageUrls.length > 0) {
    const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''
    for (const url of imageUrls) {
      try {
        const parsed = new URL(url)
        const isR2 = r2PublicUrl && url.startsWith(r2PublicUrl)
        const isCloudflare = /\.r2\.cloudflarestorage\.com$/.test(parsed.hostname)
          || /^pub-.*\.r2\.dev$/.test(parsed.hostname)
        if (!isR2 && !isCloudflare) {
          return { error: '허용되지 않은 이미지 주소입니다' }
        }
      } catch {
        return { error: '올바르지 않은 이미지 주소입니다' }
      }
    }
  }

  // 커뮤니티 게시판만 slug 생성 (MAGAZINE/JOB/WEEKLY는 각자 slug 관리)
  const COMMUNITY_BOARD_TYPES: BoardType[] = ['STORY', 'HUMOR', 'LIFE2']
  const communitySlug = COMMUNITY_BOARD_TYPES.includes(boardType)
    ? await generateCommunitySlug(title)
    : undefined

  // 게시글 생성 — HTML 새니타이즈 (TipTap HTML 지원)
  const safeContent = sanitizeHtml(content)
  const plainText = stripHtmlTags(safeContent)
  const summary = plainText.length > 100
    ? plainText.slice(0, 97) + '...'
    : plainText

  // 이미지 URL을 본문에 추가 (검증 완료된 URL만)
  let finalContent = safeContent
  if (imageUrls.length > 0) {
    const imgTags = imageUrls
      .map((url) => `<p><img src="${encodeURI(url)}" alt="첨부 이미지" /></p>`)
      .join('')
    finalContent += imgTags
  }

  // post.create + postCount 증가를 단일 트랜잭션으로 (부분 실패 방지)
  const post = await prisma.$transaction(async (tx) => {
    const newPost = await tx.post.create({
      data: {
        boardType,
        category: category || null,
        title,
        content: finalContent,
        summary,
        thumbnailUrl: imageUrls[0] || null,
        authorId: session.user.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        slug: communitySlug ?? null,
      },
    })
    await tx.user.update({
      where: { id: session.user.id },
      data: { postCount: { increment: 1 } },
    })
    return newPost
  })
  void checkAndPromote(session.user.id).catch(() => {})

  const boardSlugPath = BOARD_TYPE_TO_SLUG[boardType]
  revalidatePath(`/community/${boardSlugPath}`)
  revalidatePath('/')
  return { postUrl: `/community/${boardSlugPath}/${communitySlug ?? post.id}` }
}

export async function updatePost(postId: string, formData: FormData): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  // 게시글 소유권 확인
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, boardType: true, status: true },
  })
  if (!existing || existing.status === 'DELETED') {
    return { error: '존재하지 않는 게시글입니다' }
  }
  if (existing.authorId !== session.user.id) {
    return { error: '본인의 글만 수정할 수 있습니다' }
  }

  const category = formData.get('category') as string | null
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  const imageUrls = formData.getAll('imageUrls') as string[]

  if (!title || !content) {
    return { error: '필수 항목을 모두 입력해 주세요' }
  }
  if (title.length < 2 || title.length > 40) {
    return { error: '제목은 2~40자로 입력해 주세요' }
  }
  if (stripHtmlTags(content).trim().length < 10) {
    return { error: '본문은 10자 이상 입력해 주세요' }
  }

  // 금지어 검사
  const bannedInTitle = await checkBannedWords(title)
  if (bannedInTitle) {
    return { error: '제목에 사용할 수 없는 표현이 포함되어 있습니다.' }
  }
  const bannedInContent = await checkBannedWords(content)
  if (bannedInContent) {
    return { error: '본문에 사용할 수 없는 표현이 포함되어 있습니다.' }
  }

  // 카테고리 유효성 확인
  if (category) {
    const boardConfig = await prisma.boardConfig.findUnique({
      where: { boardType: existing.boardType },
    })
    if (boardConfig && !boardConfig.categories.includes(category)) {
      return { error: '유효하지 않은 카테고리입니다' }
    }
  }

  // 이미지 URL 검증
  if (imageUrls.length > 0) {
    const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''
    for (const url of imageUrls) {
      try {
        const parsed = new URL(url)
        const isR2 = r2PublicUrl && url.startsWith(r2PublicUrl)
        const isCloudflare = /\.r2\.cloudflarestorage\.com$/.test(parsed.hostname)
          || /^pub-.*\.r2\.dev$/.test(parsed.hostname)
        if (!isR2 && !isCloudflare) {
          return { error: '허용되지 않은 이미지 주소입니다' }
        }
      } catch {
        return { error: '올바르지 않은 이미지 주소입니다' }
      }
    }
  }

  const safeContent = sanitizeHtml(content)
  const plainText = stripHtmlTags(safeContent)
  const summary = plainText.length > 100
    ? plainText.slice(0, 97) + '...'
    : plainText

  let finalContent = safeContent
  if (imageUrls.length > 0) {
    const imgTags = imageUrls
      .map((url) => `<p><img src="${encodeURI(url)}" alt="첨부 이미지" /></p>`)
      .join('')
    finalContent += imgTags
  }

  await prisma.post.update({
    where: { id: postId },
    data: {
      category: category || null,
      title,
      content: finalContent,
      summary,
      thumbnailUrl: imageUrls[0] || null,
    },
  })

  const slug = BOARD_TYPE_TO_SLUG[existing.boardType]
  revalidatePath(`/community/${slug}/${postId}`)
  revalidatePath(`/community/${slug}`)
  return { postUrl: `/community/${slug}/${postId}` }
}

export async function deletePost(postId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, boardType: true, status: true, thumbnailUrl: true },
  })
  if (!post || post.status === 'DELETED') {
    return { error: '존재하지 않는 게시글입니다' }
  }
  if (post.authorId !== session.user.id) {
    return { error: '본인의 글만 삭제할 수 있습니다' }
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: 'DELETED' },
  })

  // R2 썸네일 삭제 (best-effort)
  if (post.thumbnailUrl) {
    const key = extractR2KeyFromUrl(post.thumbnailUrl)
    if (key) await deleteFromR2(key).catch(() => {})
  }

  const slug = BOARD_TYPE_TO_SLUG[post.boardType]
  revalidatePath(`/community/${slug}`)
  revalidatePath(`/community/${slug}/${postId}`)
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
  redirect(`/community/${slug}`)
}
