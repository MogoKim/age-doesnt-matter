import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { getMyPosts } from '@/lib/queries/my'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import PostCard from '@/components/features/community/PostCard'

export const metadata: Metadata = {
  title: '내가 쓴 글',
}

export default async function MyPostsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { posts } = await getMyPosts(session.user.id)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-[0.88rem] font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">📝 내가 쓴 글</h1>

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
          <p className="text-base text-muted-foreground leading-[1.8]">
            아직 작성한 글이 없어요.<br />
            일상 이야기, 고민, 유머 등 편하게 나눠보세요!
          </p>
          <Link
            href="/community/write"
            className="mt-4 inline-flex items-center min-h-[52px] px-6 py-3 bg-primary text-white rounded-xl text-sm font-bold no-underline transition-all hover:bg-[#E85D50]"
          >
            글쓰기
          </Link>
        </div>
      )}
    </div>
  )
}
