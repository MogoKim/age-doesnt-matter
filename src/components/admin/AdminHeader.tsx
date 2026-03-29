'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminLogout } from '@/lib/actions/admin-auth'
import { adminPageTitles } from './admin-nav'
import AdminMobileNav from './AdminMobileNav'

export default function AdminHeader() {
  const pathname = usePathname()
  const title = adminPageTitles[pathname] || '어드민'
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 lg:hidden"
            aria-label="메뉴 열기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 text-sm">
            {pathname !== '/admin' && (
              <>
                <Link href="/admin" className="text-zinc-400 hover:text-zinc-600 no-underline">
                  어드민
                </Link>
                <span className="text-zinc-300">›</span>
              </>
            )}
            <span className="font-bold text-zinc-900">{title}</span>
          </div>
        </div>
        <form action={adminLogout}>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-[15px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            로그아웃
          </button>
        </form>
      </header>
      <AdminMobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
    </>
  )
}
