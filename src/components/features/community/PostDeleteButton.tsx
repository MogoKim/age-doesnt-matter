'use client'

import { useState, useTransition } from 'react'
import { deletePost } from '@/lib/actions/posts'
import { useToast } from '@/components/common/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function PostDeleteButton({ postId }: { postId: string }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  function handleDelete() {
    if (isPending) return
    setShowConfirm(true)
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deletePost(postId)
      if (result?.error) {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <>
      <button
        className="text-[17px] text-muted-foreground min-h-[52px] px-3 py-1 rounded-lg hover:text-destructive transition-colors"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending ? '삭제 중...' : '삭제'}
      </button>
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => { setShowConfirm(false); confirmDelete() }}
        title="게시글 삭제"
        message="이 글을 삭제하시겠어요? 삭제 후에는 복구할 수 없습니다."
        confirmLabel="삭제"
        variant="destructive"
        isLoading={isPending}
      />
    </>
  )
}
