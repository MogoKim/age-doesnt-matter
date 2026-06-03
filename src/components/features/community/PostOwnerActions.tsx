'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import PostDeleteButton from './PostDeleteButton'

interface PostOwnerActionsProps {
  authorId: string | null
  boardSlug: string
  postId: string
}

export default function PostOwnerActions({ authorId, boardSlug, postId }: PostOwnerActionsProps) {
  const { data: session, status } = useSession()
  if (status !== 'authenticated' || !authorId || session.user.id !== authorId) return null

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/community/${boardSlug}/${postId}/edit`}
        className="text-[17px] text-muted-foreground min-h-[52px] px-3 py-1 rounded-lg hover:text-primary-text transition-colors no-underline flex items-center"
      >
        수정
      </Link>
      <PostDeleteButton postId={postId} />
    </div>
  )
}
