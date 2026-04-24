'use client'

import { useState } from 'react'
import { shareToKakao, copyShareLink } from '@/lib/kakao-share'
import { useToast } from '@/components/common/Toast'
import { IconShare, IconKakao, IconCopy } from '@/components/icons'

interface ShareButtonProps {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export default function ShareButton({ title, description, imageUrl, url }: ShareButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  async function handleKakaoShare() {
    try {
      await shareToKakao({ title, description, imageUrl, url })
      setOpen(false)
    } catch {
      toast('카카오톡 공유에 실패했어요', 'error')
    }
  }

  async function handleCopyLink() {
    const ok = await copyShareLink(url)
    if (ok) {
      toast('링크가 복사되었어요', 'success')
    } else {
      toast('링크 복사에 실패했어요', 'error')
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="icon-hover flex items-center justify-center min-w-[52px] min-h-[52px] text-muted-foreground hover:text-primary-text hover:bg-primary/5 rounded-xl lg:min-h-[44px] lg:min-w-[44px]"
        aria-label="공유하기"
      >
        <IconShare size={20} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg p-1 min-w-[160px]">
            <button
              type="button"
              onClick={handleKakaoShare}
              className="action-btn flex items-center gap-2.5 w-full px-4 py-3 min-h-[52px] text-sm text-foreground font-medium rounded-lg hover:bg-primary/5 hover:text-primary-text lg:min-h-[44px]"
            >
              <IconKakao size={18} />
              <span>카카오톡</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="action-btn flex items-center gap-2.5 w-full px-4 py-3 min-h-[52px] text-sm text-foreground font-medium rounded-lg hover:bg-primary/5 hover:text-primary-text lg:min-h-[44px]"
            >
              <IconCopy size={18} />
              <span>링크 복사</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
