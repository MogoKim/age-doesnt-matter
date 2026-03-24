import Link from 'next/link'
import Image from 'next/image'
import NotificationBadge from '@/components/common/NotificationBadge'
import { IconSearch, IconUser } from '@/components/icons'

interface HeaderProps {
  isLoggedIn?: boolean
}

export default function Header({ isLoggedIn = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-[100] h-14 bg-card border-b border-border flex items-center justify-between px-4 lg:hidden">
      <Link href="/" className="flex items-center gap-2 no-underline" aria-label="우나어 홈">
        <Image
          src="/images/logo.png"
          alt=""
          width={32}
          height={32}
          className="w-8 h-8 object-contain"
          aria-hidden="true"
        />
        <span className="text-lg font-bold text-primary-text">우나어</span>
      </Link>

      <div className="flex items-center gap-1">
        <Link href="/search" className="flex items-center justify-center w-[52px] h-[52px] rounded-lg text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-background hover:text-foreground transition-colors" aria-label="검색">
          <IconSearch size={22} />
        </Link>
        {isLoggedIn && <NotificationBadge />}
        <Link
          href={isLoggedIn ? '/my' : '/login'}
          className="flex items-center justify-center w-[52px] h-[52px] rounded-lg text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-background hover:text-foreground transition-colors"
          aria-label={isLoggedIn ? '마이페이지' : '로그인'}
        >
          <IconUser size={22} />
        </Link>
      </div>
    </header>
  )
}
