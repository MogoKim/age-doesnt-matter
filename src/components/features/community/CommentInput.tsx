'use client'

import { useState, useTransition } from 'react'
import { createComment } from '@/lib/actions/comments'

interface CommentInputProps {
  postId: string
  parentId?: string
  onCancel?: () => void
  placeholder?: string
}

export default function CommentInput({ postId, parentId, onCancel, placeholder }: CommentInputProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!value.trim() || isPending) return
    setError('')

    startTransition(async () => {
      const result = await createComment(postId, value, parentId)
      if (result.error) {
        setError(result.error)
      } else {
        setValue('')
        onCancel?.()
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-[15px] text-destructive font-medium px-1">{error}</p>
      )}
      <div className="flex items-end gap-2 p-4 bg-card border border-border rounded-2xl mt-2 shadow-sm max-md:sticky max-md:bottom-0 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
        <textarea
          className="flex-1 min-h-[52px] px-4 py-2.5 border border-border rounded-xl text-base text-foreground bg-background resize-none outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground"
          placeholder={placeholder || '댓글을 남겨주세요...'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={1}
        />
        <div className="flex gap-1.5">
          {onCancel && (
            <button
              className="min-h-[52px] min-w-[52px] px-3 py-2.5 bg-card text-muted-foreground border border-border rounded-xl text-[15px] font-bold cursor-pointer transition-all hover:text-foreground"
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
          )}
          <button
            className="min-h-[52px] min-w-[72px] px-4 py-2.5 bg-primary text-white border-none rounded-xl text-[15px] font-bold cursor-pointer transition-all whitespace-nowrap hover:bg-[#E85D50] hover:shadow-[0_2px_8px_rgba(255,111,97,0.3)] disabled:bg-border disabled:cursor-not-allowed disabled:shadow-none"
            disabled={!value.trim() || isPending}
            onClick={handleSubmit}
          >
            {isPending ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
