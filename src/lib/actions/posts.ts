'use server'

import { encodePathSegment } from '@/lib/post-url'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BOARD_SLUG_MAP, BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType } from '@/generated/prisma/client'
import { checkBannedWords } from '@/lib/banned-words'
import { sanitizeHtml, stripHtmlTags } from '@/lib/sanitize'
import { buildSummary } from '@/lib/summary'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
import { checkAndPromote } from '@/lib/grade'
import { generateCommunitySlug } from '@/lib/seo/slug'
import { postDetailCacheTag, postCacheKeys } from '@/lib/queries/posts/posts.base'
import { getWriteBlockReason } from '@/lib/sanctions'

interface CreatePostResult {
  error?: string
  postUrl?: string
}

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  // 제재(정지/차단) 유저는 세션이 살아있어도 작성 차단
  const blockReason = await getWriteBlockReason(session.user.id)
  if (blockReason) {
    return { error: blockReason }
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

  // 이미지/동영상 전용 게시글 허용 — 클라이언트 hasMedia 검증과 일치
  const hasMedia = /<(?:img|video)\s[^>]*src\s*=/i.test(content)
  if (!hasMedia && stripHtmlTags(content).trim().length < 10) {
    return { error: '본문은 10자 이상 입력해 주세요' }
  }

  // 금지어/게시판/slug 준비는 서로 독립적이라 병렬 처리한다.
  const COMMUNITY_BOARD_TYPES: BoardType[] = ['STORY', 'HUMOR', 'LIFE2']
  const [bannedInTitle, bannedInContent, boardConfig, communitySlug] = await Promise.all([
    checkBannedWords(title),
    checkBannedWords(content),
    prisma.boardConfig.findUnique({ where: { boardType } }),
    COMMUNITY_BOARD_TYPES.includes(boardType)
      ? generateCommunitySlug(title)
      : Promise.resolve(undefined),
  ])
  if (bannedInTitle) {
    return { error: `제목에 사용할 수 없는 표현이 포함되어 있습니다.` }
  }
  if (bannedInContent) {
    return { error: `본문에 사용할 수 없는 표현이 포함되어 있습니다.` }
  }

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

  // 게시글 생성 — HTML 새니타이즈 (TipTap HTML 지원)
  const safeContent = sanitizeHtml(content)
  // 미리보기는 @/lib/summary의 buildSummary 하나로 만든다(경로별 자체 절단 금지)
  const summary = buildSummary(safeContent)

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
  updateTag('home-trending')
  updateTag('home-stories')
  updateTag('home-humor')
  updateTag('home-magazine')
  updateTag('home-jobs')
  updateTag('community-board-page')
  // 🔴 작성 직후 이동 경로 — slug 가 한글이면 인코딩된 경로여야 한다.
  return { postUrl: `/community/${boardSlugPath}/${encodePathSegment(communitySlug ?? post.id)}` }
}

export async function updatePost(postId: string, formData: FormData): Promise<CreatePostResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  // 게시글 소유권 확인
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, boardType: true, status: true, slug: true },
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
  // 이미지/동영상 전용 게시글 허용 — 클라이언트 hasMedia 검증과 일치
  const hasMedia = /<(?:img|video)\s[^>]*src\s*=/i.test(content)
  if (!hasMedia && stripHtmlTags(content).trim().length < 10) {
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
  // 생성 경로와 같은 규칙으로 다시 만든다 — 수정 후 미리보기가 어긋나지 않게
  const summary = buildSummary(safeContent)

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

  // `boardSlug` — 글 slug 가 아니라 **보드** slug 다(ASCII 고정). 이름이 겹치면 인코딩 판단이 헷갈린다.
  const boardSlug = BOARD_TYPE_TO_SLUG[existing.boardType]
  revalidatePath(`/community/${boardSlug}/${postId}`)
  revalidatePath(`/community/${boardSlug}`)
  // 🔴 이 글 하나만 무효화한다. 전역 'post-detail' 을 쓰면 **다른 모든 글의 상세 캐시**까지 날아간다.
  //    한 글이 CUID·slug 두 키로 캐시될 수 있으므로 둘 다 지운다(`postDetailCacheTag` 주석 참조).
  //    이 경로는 slug 를 바꾸지 않는다 — 옛 slug 처리는 필요 없고, 새로 만들지도 않는다.
  for (const key of postCacheKeys(postId, existing.slug)) updateTag(postDetailCacheTag(key))
  // post-meta·홈 태그는 전역 그대로 둔다 — 글별 태그가 없고, 목록/홈 구성에는 실제로 영향을 준다.
  updateTag('post-meta')
  updateTag('home-trending')
  updateTag('home-stories')
  updateTag('home-humor')
  return { postUrl: `/community/${boardSlug}/${encodePathSegment(postId)}` }
}

export async function deletePost(postId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, boardType: true, status: true, thumbnailUrl: true, slug: true },
  })
  if (!post || post.status === 'DELETED') {
    return { error: '존재하지 않는 게시글입니다' }
  }
  if (post.authorId !== session.user.id) {
    return { error: '본인의 글만 삭제할 수 있습니다' }
  }

  // 글 삭제 + 작성자 postCount 감소를 단일 트랜잭션으로 (생성 시 increment와 대칭)
  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: { status: 'DELETED' },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { postCount: { decrement: 1 } },
    }),
  ])

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
  // 🔴 이 글 하나만 무효화한다(위 updatePost 와 같은 이유). CUID·slug 둘 다.
  for (const key of postCacheKeys(postId, post.slug)) updateTag(postDetailCacheTag(key))
  updateTag('post-meta')
  updateTag('home-trending')
  updateTag('home-stories')
  updateTag('home-humor')
  updateTag('home-magazine')
  updateTag('home-jobs')
  updateTag('community-board-page')
  redirect(`/community/${slug}`)
}
