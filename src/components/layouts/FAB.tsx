'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { IconWrite } from '@/components/icons'
import LoginPromptModal from '@/components/features/auth/LoginPromptModal'

const FAB_PAGES = ['/community/stories', '/community/humor', '/community/life2']

interface FABProps {
  isLoggedIn?: boolean
}

export default function FAB({ isLoggedIn = false }: FABProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

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

  const board = pathname.includes('stories') ? 'stories' : pathname.includes('life2') ? 'life2' : 'humor'

  const fabClassName = cn(
    'group fixed bottom-[96px] right-6 z-[97] flex items-center gap-2 h-[52px] px-6 bg-primary text-white rounded-full shadow-[0_4px_20px_rgba(255,111,97,0.30)] text-body font-bold cursor-pointer transition-all duration-200 no-underline [-webkit-tap-highlight-color:transparent] active:scale-95',
    'lg:bottom-8 lg:right-8 lg:h-14 lg:w-14 lg:p-0 lg:justify-center lg:hover:w-auto lg:hover:px-6',
    collapsed && 'px-4 w-[52px] justify-center'
  )

  const labelClassName = cn(
    'text-body whitespace-nowrap overflow-hidden transition-all duration-200 max-w-[100px] opacity-100',
    'lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[100px] lg:group-hover:opacity-100 lg:group-hover:ml-2',
    collapsed && 'max-w-0 opacity-0 p-0'
  )

  return (
    <>
      {isLoggedIn ? (
        <Link href={`/community/write?board=${board}`} className={fabClassName} aria-label="글쓰기">
          <IconWrite size={20} />
          <span className={labelClassName}>글쓰기</span>
        </Link>
      ) : (
        <button className={fabClassName} onClick={() => setShowLoginPrompt(true)} aria-label="글쓰기">
          <IconWrite size={20} />
          <span className={labelClassName}>글쓰기</span>
        </button>
      )}

      {showLoginPrompt && (
        <LoginPromptModal
          message="글을 쓰려면 로그인이 필요해요"
          onClose={() => setShowLoginPrompt(false)}
        />
      )}
    </>
  )
}
