'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { IconBest, IconJobs, IconStories, IconEnergy, IconMagazine, IconLife2 } from '@/components/icons'

const MENU_ITEMS = [
  { icon: IconBest, label: '베스트', href: '/best' },
  { icon: IconStories, label: '사는이야기', href: '/community/stories' },
  { icon: IconLife2, label: '2막준비', href: '/community/life2' },
  { icon: IconEnergy, label: '웃음방', href: '/community/humor' },
  { icon: IconMagazine, label: '매거진', href: '/magazine' },
  { icon: IconJobs, label: '내일찾기', href: '/jobs' },
] as const

export default function IconMenu() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-[64px] z-[99] min-h-[76px] bg-card border-b border-border flex items-center lg:hidden overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:x_proximity] px-0 gap-0" aria-label="주요 메뉴">
      {MENU_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-icon-hover flex flex-col items-center justify-center gap-2 shrink-0 w-[70px] min-h-[64px] py-2 px-1 no-underline text-muted-foreground relative [-webkit-tap-highlight-color:transparent] [scroll-snap-align:start] hover:text-primary-text',
              isActive && 'text-primary-text after:content-[""] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-6 after:h-0.5 after:bg-primary after:rounded-sm'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={24} filled={isActive} />
            <span className="text-caption leading-none whitespace-nowrap">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
