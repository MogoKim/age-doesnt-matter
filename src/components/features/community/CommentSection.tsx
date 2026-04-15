'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { CommentItem as CommentItemType } from '@/types/api'
import CommentItemComponent from './CommentItem'
import CommentInput from './CommentInput'

interface CommentSectionProps {
  postId: string
  comments: CommentItemType[]
  isLoggedIn?: boolean
}

function sortComments(comments: CommentItemType[], sort: 'latest' | 'likes'): CommentItemType[] {
  const sorted = [...comments]
  if (sort === 'likes') {
    sorted.sort((a, b) => b.likeCount - a.likeCount)
  }
  return sorted
}

export default function CommentSection({ postId, comments, isLoggedIn }: CommentSectionProps) {
  const [sort, setSort] = useState<'latest' | 'likes'>('latest')

  const totalCount = comments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  const sorted = useMemo(() => sortComments(comments, sort), [comments, sort])

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-foreground">
        <h3 className="text-lg font-medium text-foreground m-0">
          💬 댓글 <span className="text-primary font-bold">{totalCount}</span>
        </h3>
        <div className="flex gap-1">
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-all ${
              sort === 'latest'
                ? 'bg-primary/5 border border-primary text-primary'
                : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
            }`}
            onClick={() => setSort('latest')}
          >
            등록순
          </button>
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-all ${
              sort === 'likes'
                ? 'bg-primary/5 border border-primary text-primary'
                : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
            }`}
            onClick={() => setSort('likes')}
          >
            공감순
          </button>
        </div>
      </div>

      {sorted.length > 0 ? (
        <div>
          {sorted.map((comment) => (
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <p className="text-body text-muted-foreground leading-[1.8]">
            아직 댓글이 없어요.<br />
            따뜻한 한마디를 남겨보세요!
          </p>
        </div>
      )}

      {isLoggedIn ? (
        <CommentInput postId={postId} />
      ) : (
        <div className="p-5 bg-card border border-border rounded-2xl mt-4 text-center">
          <p className="text-body text-muted-foreground mb-4">
            댓글을 달려면 로그인이 필요해요
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center min-h-[52px] px-6 bg-primary text-white rounded-xl text-body font-bold no-underline"
          >
            카카오 로그인
          </Link>
        </div>
      )}
    </section>
  )
}
