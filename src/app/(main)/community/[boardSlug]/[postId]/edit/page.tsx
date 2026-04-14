import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAllBoardConfigs } from '@/lib/queries/boards'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import PostWriteForm from '@/components/features/community/PostWriteForm'

export const metadata: Metadata = {
  title: '글 수정',
  description: '게시글을 수정합니다.',
}

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const WRITABLE_BOARD_TYPES = ['STORY', 'HUMOR', 'LIFE2']

export default async function EditPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { boardSlug, postId } = await params
  // 게시글 조회 + 소유권 확인
  const post = await prisma.post.findUnique({
    where: { id: postId, status: 'PUBLISHED' },
    select: {
      id: true,
      boardType: true,
      category: true,
      title: true,
      content: true,
      authorId: true,
    },
  })

  if (!post) notFound()
  if (post.authorId !== session.user.id) redirect(`/community/${boardSlug}/${postId}`)

  const allBoards = await getAllBoardConfigs()
  const writableBoards = allBoards
    .filter((b) => WRITABLE_BOARD_TYPES.includes(b.boardType))
    .map((b) => ({
      slug: b.slug,
      displayName: b.displayName,
      categories: b.categories,
    }))

  const currentSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? boardSlug

  return (
    <>
      {/* 수정 페이지도 글쓰기 전용 레이아웃: GNB(header)와 Footer 모두 숨김 */}
      <style>{'header { display: none !important; } footer { display: none !important; }'}</style>
      <div className="max-w-[720px] mx-auto px-4 pt-[52px] pb-6 md:px-6 md:pb-8">
        <PostWriteForm
          defaultBoard={currentSlug}
          boards={writableBoards}
          editData={{
            postId: post.id,
            boardSlug: currentSlug,
            category: post.category ?? '',
            title: post.title,
            content: post.content,
          }}
        />
      </div>
    </>
  )
}
