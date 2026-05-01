'use client'

import { useState, useTransition } from 'react'
import { useToast } from '@/components/common/Toast'
import { editGuestComment, deleteGuestComment } from '@/lib/actions/guest-comments'

interface GuestPasswordModalProps {
  commentId: string
  mode: 'edit' | 'delete'
  initialContent?: string
  onClose: () => void
}

export default function GuestPasswordModal({
  commentId,
  mode,
  initialContent = '',
  onClose,
}: GuestPasswordModalProps) {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [newContent, setNewContent] = useState(initialContent)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    if (!password) return

    startTransition(async () => {
      if (mode === 'delete') {
        const result = await deleteGuestComment(commentId, password)
        if (result.error) {
          toast(result.error, 'error')
          return
        }
        toast('댓글이 삭제되었어요')
        onClose()
      } else {
        const result = await editGuestComment(commentId, newContent.trim(), password)
        if (result.error) {
          toast(result.error, 'error')
          return
        }
        toast('댓글이 수정되었어요')
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-foreground mb-4">
          댓글 {mode === 'delete' ? '삭제' : '수정'}을 위해<br />비밀번호를 입력해 주세요
        </h3>

        {mode === 'edit' && (
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value.slice(0, 500))}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-xl text-body text-foreground bg-background resize-none outline-none focus:border-primary transition-colors mb-3"
          />
        )}

        <input
          type="password"
          placeholder="비밀번호 입력"
          value={password}
          onChange={(e) => setPassword(e.target.value.slice(0, 8))}
          maxLength={8}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isPending) handleConfirm() }}
          autoFocus
          className="w-full px-4 py-3 min-h-[52px] border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors mb-4"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center min-h-[52px] px-4 border border-border rounded-xl text-caption font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || !password}
            className={`flex-1 flex items-center justify-center min-h-[52px] px-4 rounded-xl text-caption font-bold text-white transition-colors disabled:bg-border disabled:cursor-not-allowed ${
              mode === 'delete'
                ? 'bg-destructive hover:bg-red-600'
                : 'bg-primary hover:bg-[#E85D50]'
            }`}
          >
            {isPending ? '처리 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
