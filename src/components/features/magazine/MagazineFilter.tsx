'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const MAGAZINE_CATEGORIES = ['전체', '건강', '재테크', '은퇴준비', '일자리', '생활', '여행', '문화', '요리']

export default function MagazineFilter({ currentCategory }: { currentCategory?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = currentCategory || '전체'

  function handleSelect(cat: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (cat === '전체') {
      params.delete('category')
    } else {
      params.set('category', cat)
    }
    router.push(`/magazine?${params.toString()}`)
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto py-2 pb-4 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="매거진 카테고리 필터"
    >
      {MAGAZINE_CATEGORIES.map((cat) => (
        <button
          key={cat}
          aria-pressed={active === cat}
          onClick={() => handleSelect(cat)}
          className={cn(
            'shrink-0 px-5 py-2.5 rounded-full border-2 text-caption font-medium transition-all min-h-[52px] whitespace-nowrap',
            active === cat
              ? 'bg-primary text-foreground border-primary font-bold'
              : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary',
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
