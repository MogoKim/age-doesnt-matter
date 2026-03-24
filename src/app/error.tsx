'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl mb-4">⚠️</p>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        문제가 발생했어요
      </h1>
      <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
        일시적인 오류가 발생했어요.
      </p>
      <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">
        잠시 후 다시 시도해 주세요.<br />
        문제가 계속되면 로그아웃 후 다시 로그인해 보세요.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-base rounded-2xl transition-opacity hover:opacity-90"
      >
        다시 시도하기
      </button>
      <a
        href="/api/auth/signout"
        className="mt-4 text-base text-muted-foreground underline hover:text-foreground"
      >
        로그아웃 후 다시 로그인하기
      </a>
    </div>
  )
}
