'use client'

import Link from 'next/link'

export default function MainError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl mb-4">😅</p>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        앗, 문제가 생겼어요
      </h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        잠시 후 다시 시도해 주세요.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-body rounded-2xl transition-opacity hover:opacity-90"
        >
          다시 시도하기
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 border-2 border-border bg-card text-foreground font-bold text-body rounded-2xl no-underline transition-colors hover:border-primary hover:text-primary"
        >
          홈으로 가기
        </Link>
      </div>
    </div>
  )
}
