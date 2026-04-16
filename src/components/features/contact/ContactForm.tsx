'use client'

import { useState, useTransition } from 'react'
import { submitContact } from '@/lib/actions/contact'
import { useToast } from '@/components/common/Toast'
import BottomSheet from '@/components/ui/BottomSheet'

type ContactType = 'service' | 'biz'

interface ContactFormProps {
  type: ContactType
}

export default function ContactForm({ type }: ContactFormProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleOpen() {
    setName('')
    setEmail('')
    setMessage('')
    setError('')
    setOpen(true)
  }

  function handleClose() {
    if (isPending) return
    setOpen(false)
  }

  function handleSubmit() {
    if (isPending) return
    setError('')

    startTransition(async () => {
      const result = await submitContact({
        type,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        message,
        _honey: '',
      })

      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        toast('문의가 접수됐어요. 영업일 1~2일 내 답변드려요.')
      }
    })
  }

  const typeLabel = type === 'service' ? '서비스 문의' : '제휴·광고 문의'

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center justify-center h-[52px] px-6 rounded-xl bg-primary text-white text-body font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
      >
        문의하기
      </button>

      <BottomSheet open={open} onClose={handleClose} title={typeLabel}>
        <div className="space-y-5">
          {/* 이름 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              이름 <span className="text-muted-foreground font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              maxLength={30}
              disabled={isPending}
              className="w-full h-[52px] px-4 rounded-xl border border-border bg-background text-body text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] disabled:opacity-50"
            />
          </div>

          {/* 이메일 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              답장 받을 이메일 <span className="text-muted-foreground font-normal">(선택)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              maxLength={100}
              disabled={isPending}
              className="w-full h-[52px] px-4 rounded-xl border border-border bg-background text-body text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] disabled:opacity-50"
            />
          </div>

          {/* 문의 내용 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              문의 내용 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="서비스 이용 중 불편한 점이나 궁금한 점을 자유롭게 적어주세요"
              maxLength={500}
              rows={5}
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-body text-foreground placeholder:text-muted-foreground resize-none outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] disabled:opacity-50"
            />
            <p className="text-sm text-muted-foreground text-right">{message.length}/500</p>
          </div>

          {/* 에러 */}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* honeypot (봇 방지) */}
          <input type="text" name="_honey" tabIndex={-1} aria-hidden style={{ display: 'none' }} readOnly value="" />

          {/* 전송 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={isPending || message.trim().length < 10}
            className="w-full h-[52px] rounded-xl bg-primary text-white text-body font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isPending ? '전송 중...' : '문의 보내기'}
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
