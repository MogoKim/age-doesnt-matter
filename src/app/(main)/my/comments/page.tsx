import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMyComments } from '@/lib/queries/my'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import type { BoardType } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'

export const metadata = { title: '내 댓글' }

export default async function MyCommentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { comments } = await getMyComments(session.user.id)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">💬 내 댓글</h1>

      {comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map((comment) => {
            const boardSlug = BOARD_TYPE_TO_SLUG[comment.postBoardType as BoardType] ?? 'stories'
            return (
              <Link
                key={comment.id}
                href={`/community/${boardSlug}/${comment.postId}`}
                prefetch={false}
                className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30"
              >
                <p className="text-body text-foreground m-0 mb-2 line-clamp-2 leading-relaxed">
                  {comment.content}
                </p>
                <div className="flex items-center gap-2 text-caption text-muted-foreground">
                  <span className="truncate max-w-[200px]">{comment.postTitle}</span>
                  <span>·</span>
                  <span>{formatTimeAgo(comment.createdAt)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
          <p className="text-body text-muted-foreground leading-relaxed">
            아직 작성한 댓글이 없어요.
            <br />
            다른 분들의 글에 댓글을 남겨보세요!
          </p>
        </div>
      )}
    </div>
  )
}
