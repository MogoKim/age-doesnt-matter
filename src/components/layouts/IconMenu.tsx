'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const MENU_ITEMS = [
  { icon: '⭐', label: '베스트', href: '/best' },
  { icon: '💼', label: '내 일 찾기', href: '/jobs' },
  { icon: '💬', label: '사는 이야기', href: '/community/stories' },
  { icon: '⚡', label: '활력 충전소', href: '/community/humor' },
  { icon: '📖', label: '매거진', href: '/magazine' },
] as const

export default function IconMenu() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-14 z-[99] h-16 bg-card border-b border-border flex items-center justify-around lg:hidden" aria-label="주요 메뉴">
      {MENU_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] p-1 no-underline text-muted-foreground relative [-webkit-tap-highlight-color:transparent] transition-colors duration-150',
              isActive && 'text-primary after:content-[""] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-6 after:h-0.5 after:bg-primary after:rounded-sm'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="text-[28px] leading-none" aria-hidden="true">
              {item.icon}
            </span>
            <span className="text-xs leading-none whitespace-nowrap">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
