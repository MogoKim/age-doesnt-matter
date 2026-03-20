import Link from 'next/link'

interface HeaderProps {
  isLoggedIn?: boolean
}

export default function Header({ isLoggedIn = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-[100] h-14 bg-card border-b border-border flex items-center justify-between px-4 lg:hidden">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary no-underline" aria-label="우나어 홈">
        <span className="w-8 h-8">🟠</span>
        <span>우나어</span>
      </Link>

      <div className="flex items-center gap-1">
        <Link href="/search" className="flex items-center justify-center w-12 h-12 rounded-lg text-[22px] text-foreground [-webkit-tap-highlight-color:transparent] hover:bg-background" aria-label="검색">
          🔍
        </Link>
        <Link
          href={isLoggedIn ? '/my' : '/login'}
          className="flex items-center justify-center w-12 h-12 rounded-lg text-[22px] text-foreground [-webkit-tap-highlight-color:transparent] hover:bg-background"
          aria-label={isLoggedIn ? '마이페이지' : '로그인'}
        >
          👤
        </Link>
      </div>
    </header>
  )
}
