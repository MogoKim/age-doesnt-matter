'use client'

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-zinc-50">
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-xl font-bold text-zinc-900 mb-2">관리자 페이지 오류</h1>
      <p className="text-sm text-zinc-500 mb-6">일시적인 오류가 발생했습니다. 다시 시도해 주세요.</p>
      <button
        onClick={reset}
        className="h-10 px-6 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        다시 시도
      </button>
    </div>
  )
}
