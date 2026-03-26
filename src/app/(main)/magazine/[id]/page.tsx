import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { auth } from '@/lib/auth'
import { getPostDetail } from '@/lib/queries/posts'
import { getCommentsByPostId } from '@/lib/queries/comments'
import ActionBar from '@/components/features/community/ActionBar'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml } from '@/lib/sanitize'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const post = await getPostDetail(id)
  if (!post) return {}
  return {
    title: post.title,
    description: post.preview,
  }
}

export default async function MagazineDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await auth()
  const userId = session?.user?.id

  const post = await getPostDetail(id, userId)
  if (!post || post.boardType !== 'MAGAZINE') notFound()

  const comments = await getCommentsByPostId(id, userId)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 뒤로가기 */}
      <Link
        href="/magazine"
        className="inline-flex items-center gap-1 text-[0.88rem] font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 매거진
      </Link>

      {/* 헤더 */}
      <div className="mb-8 pb-6 border-b border-border">
        {post.category && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[0.88rem] font-bold w-fit mb-2">
            {post.category}
          </span>
        )}
        <h1 className="text-2xl font-bold text-foreground m-0 mb-4 leading-[1.4]">
          {post.title}
        </h1>
        <div className="flex items-center gap-2 text-[0.88rem] text-muted-foreground">
          <span className="font-medium text-foreground">우나어 매거진</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="text-sm text-foreground leading-[1.85] mb-8 break-keep [&_p]:mb-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-3"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
      />

      {/* 액션 바 */}
      <ActionBar
        postId={id}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={post.isLiked}
        isScrapped={post.isScrapped}
      />

      {/* 광고 슬롯 */}
      <div className="bg-[var(--surface-warm)] rounded-2xl px-4 py-8 text-center relative border border-dashed border-border text-muted-foreground text-[0.88rem] mb-8">
        <span className="absolute top-2 left-2 text-[0.88rem] text-muted-foreground bg-white/90 px-2 py-0.5 rounded-full font-medium">
          광고
        </span>
        광고 영역
      </div>

      {/* 댓글 */}
      <CommentSection postId={id} comments={comments} />
    </div>
  )
}
