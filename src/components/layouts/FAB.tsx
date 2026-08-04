'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { cn } from '@/lib/utils'
import LoginPromptModal from '@/components/features/auth/LoginPromptModal'
import { ACTIVE_COMMUNITY_PATH_TO_SLUG } from '@/lib/board-registry'

/** 홈에서 누른 글쓰기가 가는 곳 — 게시판이 정해져 있지 않아 먼저 고르게 한다 */
const BOARD_SELECT_HREF = '/community/write/select'

/**
 * 이 경로에서 글쓰기 FAB을 보일지, 보인다면 어디로 보낼지 한 번에 정한다.
 * null이면 FAB을 그리지 않는다.
 *
 * 노출 여부와 목적지를 따로 두면 "버튼은 보이는데 엉뚱한 게시판으로 가는" 상태가 생긴다.
 * 실제로 예전에는 목록 4곳에서만 보이게 해놓고 목적지는 pathname.includes로 골랐는데,
 * 어느 것에도 안 걸리면 humor로 떨어졌다 — 홈에 FAB을 붙이는 순간 홈 글이 전부
 * 웃음방으로 갔을 상황이다. 그래서 판정을 이 함수 하나로 모은다.
 */
function resolveWriteHref(pathname: string): string | null {
  if (pathname === '/') return BOARD_SELECT_HREF
  const slug = ACTIVE_COMMUNITY_PATH_TO_SLUG[pathname]
  return slug ? `/community/write?board=${slug}` : null
}

export default function FAB() {
  const pathname = usePathname()
  const { status } = useAppSession()
  const isLoggedIn = status === 'authenticated'
  const [collapsed, setCollapsed] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

  const writeHref = resolveWriteHref(pathname)
  const showFAB = writeHref !== null

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

  // showFAB이 아니라 writeHref로 막아야 아래에서 href 타입이 string으로 좁혀진다
  if (writeHref === null) return null

  const fabClassName = cn(
    'group fixed bottom-6 right-6 z-[97] flex items-center gap-2 h-[52px] px-6 bg-primary text-white rounded-full shadow-[0_4px_20px_rgba(255,111,97,0.35)] text-body font-bold cursor-pointer transition-all duration-200 no-underline [-webkit-tap-highlight-color:transparent] active:scale-95',
    'lg:bottom-8 lg:right-8 lg:h-14 lg:w-14 lg:p-0 lg:justify-center lg:hover:w-auto lg:hover:px-6',
    collapsed && 'px-4 w-[52px] justify-center gap-0'
  )

  const labelClassName = cn(
    'text-body whitespace-nowrap overflow-hidden transition-all duration-200 max-w-[100px] opacity-100',
    'lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[100px] lg:group-hover:opacity-100 lg:group-hover:ml-2',
    collapsed && 'max-w-0 opacity-0 p-0'
  )

  return (
    <>
      {isLoggedIn ? (
        <Link href={writeHref} className={fabClassName} style={{ color: 'white' }} aria-label="글쓰기">
          <svg width={collapsed ? 28 : 22} height={collapsed ? 28 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={collapsed ? 3.5 : 2.5} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className={labelClassName} style={{ color: 'white' }}>글쓰기</span>
        </Link>
      ) : (
        <button className={fabClassName} style={{ color: 'white' }} onClick={() => setShowLoginPrompt(true)} aria-label="글쓰기">
          <svg width={collapsed ? 28 : 22} height={collapsed ? 28 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={collapsed ? 3.5 : 2.5} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className={labelClassName} style={{ color: 'white' }}>글쓰기</span>
        </button>
      )}

      {showLoginPrompt && (
        <LoginPromptModal
          message="글을 쓰려면 로그인이 필요해요"
          // 로그인하면 누르려던 곳으로 그대로 데려간다 — 예전에는 이 값을 안 넘겨 홈으로 떨어졌다
          callbackUrl={writeHref}
          onClose={() => setShowLoginPrompt(false)}
        />
      )}
    </>
  )
}
