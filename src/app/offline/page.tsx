import Link from 'next/link'

export const metadata = {
  title: '오프라인',
}

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl mb-4">📡</p>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        인터넷 연결이 끊겼어요
      </h1>
      <p className="text-body text-muted-foreground mb-8 leading-relaxed">
        인터넷 연결을 확인하고 다시 시도해 주세요.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-body rounded-2xl no-underline transition-opacity hover:opacity-90"
      >
        다시 시도하기
      </Link>
    </div>
  )
}
