'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { IconBest, IconJobs, IconStories, IconEnergy, IconMagazine } from '@/components/icons'

const MENU_ITEMS = [
  { icon: IconBest, label: '베스트', href: '/best' },
  { icon: IconJobs, label: '내 일 찾기', href: '/jobs' },
  { icon: IconStories, label: '사는 이야기', href: '/community/stories' },
  { icon: IconEnergy, label: '활력 충전소', href: '/community/humor' },
  { icon: IconMagazine, label: '매거진', href: '/magazine' },
] as const

export default function IconMenu() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-14 z-[99] h-16 bg-card border-b border-border flex items-center justify-around lg:hidden" aria-label="주요 메뉴">
      {MENU_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-icon-hover flex flex-col items-center justify-center gap-1 min-w-[52px] min-h-[52px] p-1 no-underline text-muted-foreground relative [-webkit-tap-highlight-color:transparent] hover:text-primary-text',
              isActive && 'text-primary-text after:content-[""] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-6 after:h-0.5 after:bg-primary after:rounded-sm'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={24} filled={isActive} />
            <span className="text-[15px] leading-none whitespace-nowrap">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
