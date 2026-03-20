import type { Metadata } from 'next'
import PostWriteForm from '@/components/features/community/PostWriteForm'

export const metadata: Metadata = {
  title: '글쓰기',
  description: '새로운 글을 작성합니다.',
}

interface PageProps {
  searchParams: Promise<{ board?: string }>
}

export default async function WritePage({ searchParams }: PageProps) {
  const { board } = await searchParams

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-foreground m-0 mb-6 pb-4 border-b-2 border-foreground">글쓰기</h1>
      <PostWriteForm defaultBoard={board} />
    </div>
  )
}
