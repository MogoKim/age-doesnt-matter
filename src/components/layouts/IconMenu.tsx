'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { IconBest, IconJobs, IconStories, IconEnergy, IconMagazine, IconLife2 } from '@/components/icons'

const MENU_ITEMS = [
  { icon: IconBest,     label: '베스트',    href: '/best',             bgVar: '--icon-best-bg',     strokeVar: '--icon-best-stroke' },
  { icon: IconStories,  label: '사는이야기', href: '/community/stories', bgVar: '--icon-life-bg',     strokeVar: '--icon-life-stroke' },
  { icon: IconLife2,    label: '2막준비',   href: '/community/life2',  bgVar: '--icon-life2-bg',    strokeVar: '--icon-life2-stroke' },
  { icon: IconEnergy,   label: '웃음방',    href: '/community/humor',  bgVar: '--icon-laugh-bg',    strokeVar: '--icon-laugh-stroke' },
  { icon: IconMagazine, label: '매거진',    href: '/magazine',         bgVar: '--icon-magazine-bg', strokeVar: '--icon-magazine-stroke' },
  { icon: IconJobs,     label: '내일찾기',  href: '/jobs',             bgVar: '--icon-job-bg',      strokeVar: '--icon-job-stroke' },
]

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
              'flex flex-col items-center justify-center gap-1.5 shrink-0 w-[70px] min-h-[64px] py-2 px-1 no-underline text-muted-foreground relative [-webkit-tap-highlight-color:transparent] [scroll-snap-align:start]',
              isActive && 'after:content-[""] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-6 after:h-0.5 after:bg-primary after:rounded-sm'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              className={cn(
                'flex items-center justify-center w-[48px] h-[48px] rounded-2xl transition-all',
              )}
              style={{
                background: `var(${item.bgVar})`,
                color: `var(${item.strokeVar})`,
                ...(isActive ? { outline: `2px solid var(${item.strokeVar})`, outlineOffset: '2px' } : {}),
              }}
            >
              <Icon size={22} filled={false} />
            </span>
            <span
              className={cn(
                'text-[11px] leading-none whitespace-nowrap',
                isActive ? 'font-semibold' : 'text-muted-foreground'
              )}
              style={isActive ? { color: `var(${item.strokeVar})` } : undefined}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
