'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: '콘텐츠 목록', href: '/admin/content' },
  { label: '홈 편성', href: '/admin/content/home' },
  { label: '베스트 편성', href: '/admin/content/best' },
]

export default function ContentNavTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b border-zinc-200 mb-6">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
