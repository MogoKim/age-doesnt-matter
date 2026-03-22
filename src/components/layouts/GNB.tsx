'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import NotificationBadge from '@/components/common/NotificationBadge'

const MENU_ITEMS = [
  { label: '베스트', href: '/best' },
  { label: '내 일 찾기', href: '/jobs' },
  { label: '사는 이야기', href: '/community/stories' },
  { label: '활력 충전소', href: '/community/humor' },
  { label: '매거진', href: '/magazine' },
] as const

interface GNBProps {
  isLoggedIn?: boolean
  nickname?: string
}

export default function GNB({ isLoggedIn = false, nickname }: GNBProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  return (
    <nav className="hidden lg:flex sticky top-0 z-[100] h-16 bg-card border-b border-border items-center justify-center" aria-label="메인 네비게이션">
      <div className="flex items-center w-full max-w-[1200px] px-8 gap-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary no-underline shrink-0" aria-label="우나어 홈">
          <span className="w-9 h-9">🟠</span>
          <span>우나어</span>
        </Link>

        <div className="flex items-center gap-8 flex-1">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-[15px] text-muted-foreground no-underline py-1 relative transition-colors duration-150 whitespace-nowrap hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary',
                  isActive && 'text-primary font-medium after:content-[""] after:absolute after:-bottom-5 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <form className="flex items-center w-60 h-12 px-4 bg-background border border-border rounded-lg text-[15px] text-foreground shrink-0 transition-colors focus-within:border-primary" onSubmit={handleSearch}>
          <input
            className="flex-1 border-none bg-transparent outline-none font-[inherit] text-inherit min-h-11 placeholder:text-muted-foreground"
            type="search"
            placeholder="통합검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="통합검색"
          />
          <button type="submit" aria-label="검색" style={{ fontSize: 16 }}>
            🔍
          </button>
        </form>

        {isLoggedIn ? (
          <div className="flex items-center gap-1 shrink-0">
            <NotificationBadge />
            <Link href="/my" className="flex items-center gap-2 text-sm text-muted-foreground no-underline whitespace-nowrap hover:text-foreground">
              <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">👤</span>
              <span>{nickname}</span>
            </Link>
          </div>
        ) : (
          <Link href="/login" className="flex items-center gap-2 text-sm text-muted-foreground no-underline shrink-0 whitespace-nowrap hover:text-foreground">
            로그인
          </Link>
        )}
      </div>
    </nav>
  )
}
