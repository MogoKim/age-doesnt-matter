'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const FAB_PAGES = ['/community/stories', '/community/humor']

export default function FAB() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const showFAB = FAB_PAGES.some((page) => pathname === page)

  useEffect(() => {
    if (!showFAB) return

    let lastY = window.scrollY

    const handleScroll = () => {
      const currentY = window.scrollY
      setCollapsed(currentY > lastY && currentY > 100)
      lastY = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showFAB])

  if (!showFAB) return null

  const board = pathname.includes('stories') ? 'STORIES' : 'HUMOR'

  return (
    <Link
      href={`/community/write?board=${board}`}
      className={cn(
        'group fixed bottom-6 right-6 z-[97] flex items-center gap-2 h-[52px] px-6 bg-primary text-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-base font-bold cursor-pointer transition-all duration-200 no-underline [-webkit-tap-highlight-color:transparent] active:scale-95',
        'lg:bottom-8 lg:right-8 lg:h-14 lg:w-14 lg:p-0 lg:justify-center lg:hover:w-auto lg:hover:px-6',
        collapsed && 'px-4 w-[52px] justify-center'
      )}
      aria-label="글쓰기"
    >
      <span className="text-xl leading-none shrink-0">✏️</span>
      <span
        className={cn(
          'whitespace-nowrap overflow-hidden transition-all duration-200 max-w-[80px] opacity-100',
          'lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[80px] lg:group-hover:opacity-100 lg:group-hover:ml-2',
          collapsed && 'max-w-0 opacity-0 p-0'
        )}
      >
        글쓰기
      </span>
    </Link>
  )
}
