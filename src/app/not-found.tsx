import Link from 'next/link'
import { IconSearch } from '@/components/icons'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 text-muted-foreground">
        <IconSearch size={56} />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        페이지를 찾을 수 없어요
      </h1>
      <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
        주소가 잘못되었거나, 삭제된 페이지일 수 있어요.
      </p>
      <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">
        아래 버튼을 눌러 홈으로 돌아가시거나,<br />
        상단 검색에서 원하는 내용을 찾아보세요.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-base rounded-2xl no-underline transition-opacity hover:opacity-90"
        >
          홈으로 가기
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 border-2 border-border bg-card text-foreground font-bold text-base rounded-2xl no-underline transition-colors hover:border-primary hover:text-primary"
          aria-label="검색 페이지로 이동"
        >
          검색하기
        </Link>
      </div>
    </div>
  )
}
