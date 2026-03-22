'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  icon: string
  href: string
}

const navItems: NavItem[] = [
  { label: '대시보드', icon: '📊', href: '/admin' },
  { label: '콘텐츠 관리', icon: '📝', href: '/admin/content' },
  { label: '회원 관리', icon: '👥', href: '/admin/members' },
  { label: '신고 관리', icon: '🛡️', href: '/admin/reports' },
  { label: '배너 관리', icon: '🖼️', href: '/admin/banners' },
  { label: '데이터 분석', icon: '📈', href: '/admin/analytics' },
  { label: '설정', icon: '⚙️', href: '/admin/settings' },
]

interface AdminSidebarProps {
  nickname: string
}

export default function AdminSidebar({ nickname }: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-dvh w-60 flex-col border-r border-zinc-200 bg-white lg:flex">
      {/* 로고 */}
      <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-5">
        <span className="text-lg font-bold text-zinc-900">🛠️ 우나어 어드민</span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium no-underline transition-colors',
                    isActive
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* 하단: 관리자 정보 */}
      <div className="border-t border-zinc-200 px-5 py-3">
        <p className="text-[15px] text-zinc-500">로그인: {nickname}</p>
      </div>
    </aside>
  )
}
