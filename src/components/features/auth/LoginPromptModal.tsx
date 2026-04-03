'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface LoginPromptModalProps {
  message: string
  onClose: () => void
}

export default function LoginPromptModal({ message, onClose }: LoginPromptModalProps) {
  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label="로그인 필요" className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* 모바일: 하단 시트 / 데스크탑: 중앙 팝업 */}
      <div className="relative bg-card rounded-t-3xl lg:rounded-3xl w-full max-w-[420px] p-8 pb-10 lg:p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 lg:slide-in-from-bottom-0 lg:fade-in">
        <div className="flex flex-col items-center text-center gap-5">
          <div className="text-[48px]">🔒</div>
          <p className="text-lg font-bold text-foreground leading-[1.6]">{message}</p>

          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 h-[52px] bg-[#FEE500] text-[#191919] rounded-xl font-bold text-body no-underline transition-colors hover:bg-[#FDD800]"
          >
            카카오로 시작하기
          </Link>

          <button
            className="text-sm text-muted-foreground cursor-pointer min-h-[52px] lg:min-h-[44px] hover:text-foreground transition-colors"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
