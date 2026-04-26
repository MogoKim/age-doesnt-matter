'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import NotificationBadge from '@/components/common/NotificationBadge'
import HeaderFontSizeToggle from '@/components/common/HeaderFontSizeToggle'
import { IconSearch, IconUser } from '@/components/icons'

const MENU_ITEMS = [
  { label: '베스트',     href: '/best' },
  { label: '사는이야기', href: '/community/stories' },
  { label: '2막준비',    href: '/community/life2' },
  { label: '웃음방',     href: '/community/humor' },
  { label: '매거진',     href: '/magazine' },
  { label: '내일찾기',   href: '/jobs' },
] as const

interface GNBProps {
  isLoggedIn?: boolean
  nickname?: string
  unreadCount?: number
}

export default function GNB({ isLoggedIn = false, nickname, unreadCount = 0 }: GNBProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length >= 2) {
      setSearchError('')
      router.push(`/search?q=${encodeURIComponent(q)}`)
    } else if (q.length > 0) {
      setSearchError('두 글자 이상 입력해 주세요')
    }
  }

  return (
    <nav className="hidden lg:flex sticky top-0 z-[100] h-16 bg-card border-b border-border items-center justify-center" aria-label="메인 네비게이션">
      <div className="flex items-center w-full max-w-[1200px] px-8 gap-4">
        <Link href="/" className="flex items-center no-underline shrink-0" aria-label="우나어 홈">
          <Image
            src="/images/logo2.png"
            alt="우리나이가어때서"
            width={200}
            height={48}
            className="h-12 w-auto object-contain"
            priority
          />
        </Link>

        <div className="flex items-center gap-6 flex-1">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-caption no-underline px-3 py-1.5 rounded-lg transition-colors duration-150 whitespace-nowrap',
                  isActive
                    ? 'bg-[#FFE9E5] text-[#C4453B] font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="relative shrink-0">
          <form className="flex items-center w-44 h-12 px-4 bg-background border border-border rounded-lg text-caption text-foreground transition-colors focus-within:border-primary" onSubmit={handleSearch} role="search" aria-label="통합검색">
            <input
              className="flex-1 border-none bg-transparent outline-none font-[inherit] text-inherit min-h-11 placeholder:text-muted-foreground"
              type="search"
              placeholder="통합검색"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchError('') }}
              aria-label="통합검색"
            />
            <button type="submit" className="icon-hover flex items-center justify-center w-[44px] h-[44px] rounded-lg text-muted-foreground hover:text-primary-text" aria-label="검색">
              <IconSearch size={18} />
            </button>
          </form>
          {searchError && (
            <p className="absolute top-full left-0 mt-1 text-xs text-destructive whitespace-nowrap" role="alert">
              {searchError}
            </p>
          )}
        </div>

        {/* 글씨 크기 + 알림/로그인 */}
        <div className="flex items-center gap-1 shrink-0">
          <HeaderFontSizeToggle />
          {isLoggedIn ? (
            <>
              <NotificationBadge initialCount={unreadCount} />
              <Link href="/my" className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-muted-foreground no-underline hover:text-foreground ml-1" aria-label={nickname ? `${nickname} — 내 페이지` : '내 페이지'} title={nickname}>
                <IconUser size={18} />
              </Link>
            </>
          ) : (
            <Link href="/login" className="flex items-center gap-2 text-sm text-muted-foreground no-underline whitespace-nowrap hover:text-foreground ml-1">
              로그인
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
