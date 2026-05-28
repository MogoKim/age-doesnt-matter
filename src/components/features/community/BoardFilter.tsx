'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'

interface BoardFilterProps {
  categories: string[]
  boardSlug: string
}

export default function BoardFilter({ categories, boardSlug }: BoardFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const currentCategory = searchParams.get('category') || '전체'

  function handleSelect(category: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (category === '전체') {
      params.delete('category')
    } else {
      params.set('category', category)
    }
    startTransition(() => {
      router.push(`/community/${boardSlug}?${params.toString()}`)
    })
  }

  return (
    <div className="relative min-w-0 overflow-hidden">
      <div className="flex gap-2 overflow-x-auto py-2 pb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="카테고리 필터">
        {categories.map((cat) => (
          <button
            key={cat}
            aria-pressed={currentCategory === cat}
            className={cn(
              'shrink-0 px-5 py-2.5 rounded-full border-2 text-body font-medium cursor-pointer transition-colors min-h-[52px] flex items-center whitespace-nowrap',
              currentCategory === cat
                ? 'bg-primary text-white border-primary font-bold'
                : 'bg-card text-foreground border-border hover:border-primary hover:text-primary-text hover:bg-muted',
              isPending && 'opacity-60',
            )}
            onClick={() => handleSelect(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none" />
    </div>
  )
}
