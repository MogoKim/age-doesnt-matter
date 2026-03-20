import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import PostWriteForm from '@/components/features/community/PostWriteForm'
import { getAllBoardConfigs } from '@/lib/queries/boards'

export const metadata: Metadata = {
  title: '글쓰기',
  description: '새로운 글을 작성합니다.',
}

interface PageProps {
  searchParams: Promise<{ board?: string }>
}

// 글쓰기 가능한 보드 타입
const WRITABLE_BOARD_TYPES = ['STORY', 'HUMOR']

export default async function WritePage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { board } = await searchParams
  const userGrade = session.user.grade ?? 'SEEDLING'

  const allBoards = await getAllBoardConfigs()
  const writableBoards = allBoards
    .filter((b) => WRITABLE_BOARD_TYPES.includes(b.boardType))
    .map((b) => ({
      slug: b.slug,
      displayName: b.displayName,
      categories: b.categories,
    }))

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-foreground m-0 mb-6 pb-4 border-b-2 border-foreground">글쓰기</h1>
      <PostWriteForm defaultBoard={board} boards={writableBoards} userGrade={userGrade} />
    </div>
  )
}
