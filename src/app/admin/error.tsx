'use client'

export default function AdminError({
  error,
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
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 mb-6 text-left">
        <p className="text-xs font-mono text-red-800 break-all whitespace-pre-wrap">
          {error.message || '알 수 없는 오류'}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-red-500">Digest: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="h-10 px-6 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        다시 시도
      </button>
    </div>
  )
}
