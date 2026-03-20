import type { CommentItem as CommentItemType } from '@/types/api'
import CommentItemComponent from './CommentItem'
import CommentInput from './CommentInput'

interface CommentSectionProps {
  postId: string
  comments: CommentItemType[]
}

export default function CommentSection({ postId, comments }: CommentSectionProps) {
  const totalCount = comments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-foreground">
        <h3 className="text-lg font-medium text-foreground m-0">
          💬 댓글 <span className="text-primary font-bold">{totalCount}</span>
        </h3>
        <div className="flex gap-1">
          <button className="px-3 py-1.5 bg-primary/5 border border-primary rounded-full text-primary text-[13px] font-bold cursor-pointer min-h-[52px] transition-all">등록순</button>
          <button className="px-3 py-1.5 bg-none border border-transparent rounded-full text-muted-foreground text-[13px] cursor-pointer min-h-[52px] transition-all hover:bg-background">공감순</button>
        </div>
      </div>

      {comments.length > 0 ? (
        <div>
          {comments.map((comment) => (
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <p className="text-sm text-muted-foreground leading-[1.8]">
            아직 댓글이 없어요. 첫 댓글을 남겨보세요!
          </p>
        </div>
      )}

      <CommentInput postId={postId} />
    </section>
  )
}
