'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface BoardFilterProps {
  categories: string[]
  boardSlug: string
}

export default function BoardFilter({ categories, boardSlug }: BoardFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get('category') || '전체'

  function handleSelect(category: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (category === '전체') {
      params.delete('category')
    } else {
      params.set('category', category)
    }
    router.push(`/community/${boardSlug}?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 overflow-x-auto py-2 pb-4 mb-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="카테고리 필터">
      {categories.map((cat) => (
        <button
          key={cat}
          aria-pressed={currentCategory === cat}
          className={cn(
            'shrink-0 px-5 py-2.5 rounded-full border-2 text-caption font-medium cursor-pointer transition-all min-h-[52px] flex items-center whitespace-nowrap shadow-sm',
            currentCategory === cat
              ? 'bg-primary text-foreground border-primary font-bold shadow-[0_2px_8px_rgba(255,111,97,0.3)]'
              : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary hover:bg-primary/5 hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(255,111,97,0.15)]'
          )}
          onClick={() => handleSelect(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
