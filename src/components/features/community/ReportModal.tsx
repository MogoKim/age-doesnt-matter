'use client'

import { useState, useTransition } from 'react'
import { reportPost, reportComment } from '@/lib/actions/reports'
import { useToast } from '@/components/common/Toast'

type ReportReason = 'PROFANITY' | 'POLITICS' | 'HATE' | 'SPAM' | 'ADULT' | 'OTHER'

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'PROFANITY', label: '욕설/비속어' },
  { value: 'POLITICS', label: '정치적 내용' },
  { value: 'HATE', label: '혐오/차별' },
  { value: 'SPAM', label: '스팸/광고' },
  { value: 'ADULT', label: '음란/성인' },
  { value: 'OTHER', label: '기타' },
]

interface ReportModalProps {
  targetId: string
  targetType: 'post' | 'comment'
  onClose: () => void
}

export default function ReportModal({ targetId, targetType, onClose }: ReportModalProps) {
  const { toast } = useToast()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!reason || isPending) return
    setError('')

    startTransition(async () => {
      const result = targetType === 'post'
        ? await reportPost(targetId, reason, description)
        : await reportComment(targetId, reason, description)

      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        toast('신고가 접수되었어요')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* 모달 본체 — 모바일: 하단 시트, 데스크탑: 중앙 팝업 */}
      <div className="relative w-full max-w-[480px] bg-card rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-foreground mb-1">🚨 신고하기</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {targetType === 'post' ? '이 게시글을' : '이 댓글을'} 신고하는 이유를 선택해 주세요.
        </p>

        {/* 신고 사유 */}
        <div className="space-y-2 mb-6">
          {REASON_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setReason(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all min-h-[52px] ${
                reason === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-background text-foreground hover:border-primary/30'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 상세 설명 (선택) */}
        {reason === 'OTHER' && (
          <div className="mb-6">
            <textarea
              className="w-full min-h-[100px] px-4 py-3 border border-border rounded-xl text-sm text-foreground bg-background resize-none outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground"
              placeholder="신고 사유를 자세히 적어주세요 (선택)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
            <p className="text-caption text-muted-foreground text-right mt-1">
              {description.length}/500
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive font-medium mb-4">{error}</p>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[52px] px-4 py-3 bg-card text-muted-foreground border border-border rounded-xl text-sm font-bold cursor-pointer transition-all hover:text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason || isPending}
            className="flex-1 min-h-[52px] px-4 py-3 bg-destructive text-white border-none rounded-xl text-sm font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? '접수 중...' : '신고하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
