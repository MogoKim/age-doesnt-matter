import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import PostWriteForm from '@/components/features/community/PostWriteForm'
import { getAllBoardConfigs } from '@/lib/queries/boards'
import { getMyDrafts } from '@/lib/actions/drafts'

export const metadata: Metadata = {
  title: '글쓰기',
  description: '새로운 글을 작성합니다.',
}

interface PageProps {
  searchParams: Promise<{ board?: string }>
}

// 글쓰기 가능한 보드 타입
const WRITABLE_BOARD_TYPES = ['STORY', 'HUMOR', 'LIFE2']

export default async function WritePage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { board } = await searchParams
  const [allBoards, drafts] = await Promise.all([
    getAllBoardConfigs(),
    getMyDrafts(),
  ])

  const writableBoards = allBoards
    .filter((b) => WRITABLE_BOARD_TYPES.includes(b.boardType))
    .map((b) => ({
      slug: b.slug,
      displayName: b.displayName,
      categories: b.categories,
    }))

  // URL searchParam이 유효하지 않은 slug일 경우 undefined로 처리
  const validSlugs = writableBoards.map((b) => b.slug)
  const validDefaultBoard = board && validSlugs.includes(board) ? board : undefined

  const serverDrafts = drafts.map((d) => ({
    id: d.id,
    boardSlug: d.boardSlug,
    category: d.category,
    title: d.title,
    updatedAt: d.updatedAt.toISOString(),
  }))

  return (
    <>
      {/* 글쓰기 전용 레이아웃: GNB(header)와 Footer 모두 숨김, 전용 헤더 사용 */}
      <style>{'header { display: none !important; } footer { display: none !important; }'}</style>
      <div className="max-w-[720px] mx-auto px-4 pt-[52px] pb-6 md:px-6 md:pb-8">
        <PostWriteForm
          defaultBoard={validDefaultBoard}
          boards={writableBoards}
          serverDrafts={serverDrafts}
        />
      </div>
    </>
  )
}
