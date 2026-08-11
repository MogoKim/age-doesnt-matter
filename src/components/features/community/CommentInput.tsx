'use client'

import { useState, useTransition } from 'react'
import AutoResizeTextarea from '@/components/common/AutoResizeTextarea'
import { createComment } from '@/lib/actions/comments'
import { gtmCommentCreate } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { useCommentFunnel } from '@/hooks/useCommentFunnel'
import { setPushToastTrigger } from '@/components/common/PushPermissionToast'
import { useToast } from '@/components/common/Toast'

interface CommentInputProps {
  postId: string
  parentId?: string
  onCancel?: () => void
  placeholder?: string
  onOptimisticAdd?: (content: string) => void
}

export default function CommentInput({ postId, parentId, onCancel, placeholder, onOptimisticAdd }: CommentInputProps) {
  const { toast } = useToast()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  // [PR-C3] 성공 이전 단계 계측. 화면·문구·제출 로직은 건드리지 않는다.
  const funnel = useCommentFunnel({ postId, parentId, userState: 'member' })

  function handleSubmit() {
    if (!value.trim() || isPending) return
    // 가드 통과 후에 보낸다 — 비활성 버튼 클릭이 시도로 잡히면 성공률 분모가 부풀려진다.
    funnel.onSubmitAttempted()
    setError('')

    startTransition(async () => {
      onOptimisticAdd?.(value)
      const result = await createComment(postId, value, parentId)
      if (result.error) {
        // 사유 코드만 남긴다 — 서버 원문 메시지는 문구 변경 시 집계가 깨지고 입력값이 섞일 수 있다.
        funnel.onSubmitFailed('server_rejected')
        setError(result.error)
      } else {
        gtmCommentCreate(parentId ? 'reply' : 'comment')
        trackEvent('comment_create', { content_type: 'post', content_id: postId, comment_type: parentId ? 'reply' : 'comment' })
        window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'engagement' }))
        setPushToastTrigger('comment')
        toast('댓글이 등록됐어요! 💬', 'success')
        setValue('')
        onCancel?.()
      }
    })
  }

  return (
    <div ref={funnel.viewRef} className="flex flex-col gap-2">
      {error && (
        <p className="text-caption text-destructive font-medium px-1">{error}</p>
      )}
      <div className="flex items-end gap-2 p-4 bg-card border border-border rounded-2xl mt-2 shadow-sm max-md:sticky max-md:bottom-[72px] max-md:z-50 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
        <AutoResizeTextarea
          className="flex-1 min-h-[52px] px-4 py-2.5 border border-border rounded-xl text-body text-foreground bg-background outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground"
          placeholder={placeholder || '댓글을 남겨주세요...'}
          value={value}
          onFocus={funnel.onInputFocus}
          onChange={(e) => {
            // 첫 글자에서만 1회 — 지웠다 다시 써도 재발화하지 않는다(훅이 보장).
            if (e.target.value.trim()) funnel.onTextStarted()
            setValue(e.target.value)
          }}
          maxLength={500}
          maxHeight={160}
          rows={1}
        />
        <div className="flex gap-1.5">
          {onCancel && (
            <button
              className="min-h-[52px] min-w-[52px] px-3 py-2.5 bg-card text-muted-foreground border border-border rounded-xl text-caption font-bold cursor-pointer transition-colors hover:text-foreground"
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
          )}
          <button
            className="min-h-[52px] min-w-[72px] px-4 py-2.5 bg-primary text-white border-none rounded-xl text-caption font-bold cursor-pointer transition-colors whitespace-nowrap hover:bg-primary/90 hover:shadow-[0_2px_8px_rgba(255,111,97,0.3)] disabled:bg-border disabled:cursor-not-allowed disabled:shadow-none"
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
