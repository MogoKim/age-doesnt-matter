'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'

const QUICK_TAGS = ['나이무관', '초보환영', '오전', '오후', '주3일', '주5일']

export default function JobQuickTags() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTags = searchParams.get('tags')?.split(',').filter(Boolean) ?? []

  const toggleTag = useCallback(
    (tag: string) => {
      const params = new URLSearchParams(searchParams.toString())
      const current = params.get('tags')?.split(',').filter(Boolean) ?? []

      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]

      if (next.length > 0) {
        params.set('tags', next.join(','))
      } else {
        params.delete('tags')
      }
      params.delete('cursor')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_TAGS.map((tag) => {
          const isActive = activeTags.includes(tag)
          return (
            <button
              key={tag}
              className={cn(
                'shrink-0 px-5 py-2.5 rounded-full border-2 text-body font-medium min-h-[52px] cursor-pointer transition-all',
                isActive
                  ? 'bg-primary/10 text-primary-text border-primary font-bold'
                  : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary-text hover:bg-primary/5',
              )}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          )
        })}
      </div>
      <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none" />
    </div>
  )
}
