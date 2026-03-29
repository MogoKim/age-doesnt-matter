'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { adminNavItems } from './admin-nav'

interface AdminMobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AdminMobileNav({ open, onOpenChange }: AdminMobileNavProps) {
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-zinc-200 px-5 py-4">
          <SheetTitle className="text-lg font-bold text-zinc-900">
            🛠️ 우나어 어드민
          </SheetTitle>
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="어드민 메뉴">
          <ul className="space-y-1">
            {adminNavItems.map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium no-underline transition-colors',
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
      </SheetContent>
    </Sheet>
  )
}
