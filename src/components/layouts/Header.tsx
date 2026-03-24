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
      <Link href="/" className="flex items-center no-underline shrink-0" aria-label="우나어 홈">
        <Image
          src="/images/logo.png"
          alt="우리나이가어때서"
          width={150}
          height={36}
          className="h-9 w-auto object-contain"
          priority
        />
      </Link>

      <div className="flex items-center gap-1">
        <Link href="/search" className="icon-hover flex items-center justify-center w-[52px] h-[52px] rounded-xl text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-primary/5 hover:text-primary-text" aria-label="검색">
          <IconSearch size={22} />
        </Link>
        {isLoggedIn && <NotificationBadge />}
        <Link
          href={isLoggedIn ? '/my' : '/login'}
          className="icon-hover flex items-center justify-center w-[52px] h-[52px] rounded-xl text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-primary/5 hover:text-primary-text"
          aria-label={isLoggedIn ? '마이페이지' : '로그인'}
        >
          <IconUser size={22} />
        </Link>
      </div>
    </header>
  )
}
