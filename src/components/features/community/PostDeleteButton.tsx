'use client'

import { useTransition } from 'react'
import { deletePost } from '@/lib/actions/posts'
import { useToast } from '@/components/common/Toast'

export default function PostDeleteButton({ postId }: { postId: string }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (isPending) return
    if (!confirm('이 글을 삭제하시겠어요?\n삭제 후에는 복구할 수 없습니다.')) return

    startTransition(async () => {
      const result = await deletePost(postId)
      if (result?.error) {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <button
      className="text-xs text-muted-foreground min-h-[52px] px-3 py-1 rounded-lg hover:text-destructive transition-colors"
      onClick={handleDelete}
      disabled={isPending}
    >
      {isPending ? '삭제 중...' : '삭제'}
    </button>
  )
}
