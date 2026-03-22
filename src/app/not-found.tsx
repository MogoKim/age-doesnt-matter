import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl mb-4">🔍</p>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        페이지를 찾을 수 없어요
      </h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        주소가 잘못되었거나, 삭제된 페이지일 수 있어요.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-base rounded-2xl no-underline transition-opacity hover:opacity-90"
      >
        홈으로 가기
      </Link>
    </div>
  )
}
