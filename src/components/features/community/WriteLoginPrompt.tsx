'use client'

import { useEffect } from 'react'
import KakaoSignupButton from '@/components/features/auth/KakaoSignupButton'

/**
 * 비회원이 글을 다 쓰고 등록을 눌렀을 때 뜨는 로그인 유도.
 *
 * 공용 LoginPromptModal("글을 쓰려면 로그인이 필요해요")과 상황이 다르다.
 * 여기서는 이미 글을 다 쓴 사람이라, 가장 먼저 없애야 하는 감정이 "내 글 날아가는 거 아냐?"다.
 * 그래서 제목 자리에 안심 문구를 두고, 로그인 말고 계속 쓰는 길도 함께 남긴다.
 * 공용 모달의 문구·동작을 바꾸면 다른 화면(공감·댓글 등)까지 영향을 받아 따로 만든다.
 *
 * 이 모달은 글을 저장하지 않는다 — 호출부가 띄우기 전에 이미 임시저장을 끝낸다.
 */
export default function WriteLoginPrompt({
  callbackUrl,
  onClose,
}: {
  /** 로그인 후 돌아올 곳 — 게시판까지 포함한 글쓰기 URL */
  callbackUrl: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="로그인하고 등록"
      className="fixed inset-0 z-[200] flex items-end justify-center lg:items-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-[420px] rounded-t-3xl bg-card p-8 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300 lg:rounded-3xl lg:p-8 lg:slide-in-from-bottom-0 lg:fade-in">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="text-[48px]" aria-hidden="true">✍️</div>

          <div>
            <p className="mb-1 text-lg font-bold leading-[1.6] text-foreground">
              작성한 글은 그대로 있어요
            </p>
            <p className="text-[17px] text-muted-foreground">
              로그인하면 이어서 등록할 수 있어요
            </p>
          </div>

          <KakaoSignupButton
            callbackUrl={callbackUrl}
            gtmFrom="write_login_prompt"
            className="flex min-h-[52px] w-full flex-wrap items-center justify-center gap-2 break-keep rounded-xl bg-[#FEE500] px-4 py-2 text-center text-body font-bold leading-tight text-[#191919] transition-colors hover:bg-[#FDD800]"
          >
            <span className="min-w-0">💛 카카오로 계속하기</span>
          </KakaoSignupButton>

          <button
            type="button"
            className="min-h-[52px] cursor-pointer text-[17px] text-muted-foreground transition-colors hover:text-foreground lg:min-h-[44px]"
            onClick={onClose}
          >
            계속 작성하기
          </button>
        </div>
      </div>
    </div>
  )
}
