import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { getMyScraps } from '@/lib/queries/my'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import PostCard from '@/components/features/community/PostCard'

export const metadata: Metadata = {
  title: '스크랩한 글',
}

export default async function MyScrapsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { posts } = await getMyScraps(session.user.id)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">📌 스크랩한 글</h1>

      {posts.length > 0 ? (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              boardSlug={BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
          <p className="text-body text-muted-foreground leading-[1.8]">
            아직 스크랩한 글이 없어요.<br />
            글 아래 북마크 아이콘을 누르면 스크랩할 수 있어요!
          </p>
        </div>
      )}
    </div>
  )
}
