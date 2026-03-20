'use client'

import { usePathname } from 'next/navigation'
import { adminLogout } from '@/lib/actions/admin-auth'

const pageTitles: Record<string, string> = {
  '/admin': '대시보드',
  '/admin/content': '콘텐츠 관리',
  '/admin/members': '회원 관리',
  '/admin/reports': '신고 관리',
  '/admin/banners': '배너 관리',
  '/admin/analytics': '데이터 분석',
  '/admin/settings': '설정',
}

export default function AdminHeader() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || '어드민'

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <h1 className="text-base font-bold text-zinc-900">{title}</h1>
      <form action={adminLogout}>
        <button
          type="submit"
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          로그아웃
        </button>
      </form>
    </header>
  )
}
