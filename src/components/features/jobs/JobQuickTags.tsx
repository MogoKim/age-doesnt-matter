'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

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
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {QUICK_TAGS.map((tag) => {
        const isActive = activeTags.includes(tag)
        return (
          <button
            key={tag}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold min-h-[52px] lg:min-h-[44px] cursor-pointer transition-all border ${
              isActive
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/30'
            }`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
