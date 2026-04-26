import Link from 'next/link'
import Image from 'next/image'
import NotificationBadge from '@/components/common/NotificationBadge'
import HeaderFontSizeToggle from '@/components/common/HeaderFontSizeToggle'
import { IconSearch, IconUser } from '@/components/icons'

interface HeaderProps {
  isLoggedIn?: boolean
  unreadCount?: number
}

export default function Header({ isLoggedIn = false, unreadCount = 0 }: HeaderProps) {
  return (
    <header className="sticky top-0 z-[100] h-[64px] bg-card border-b border-border flex items-center justify-between px-4 lg:hidden">
      <Link href="/" className="flex items-center no-underline shrink-0" aria-label="우나어 홈">
        <Image
          src="/images/logo2.png"
          alt="우리나이가어때서"
          width={60}
          height={60}
          className="h-[60px] w-[60px] rounded-lg object-contain"
          priority
        />
      </Link>

      <div className="flex items-center gap-1">
        <Link href="/search" className="icon-hover flex items-center justify-center w-[52px] h-[52px] rounded-xl text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-primary/5 hover:text-primary-text" aria-label="검색">
          <IconSearch size={22} />
        </Link>
        {/* 글씨 크기 조절 토글 */}
        <HeaderFontSizeToggle />
        {isLoggedIn && <NotificationBadge initialCount={unreadCount} />}
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
