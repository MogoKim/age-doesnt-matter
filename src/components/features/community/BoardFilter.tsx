'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import Chip from '@/components/ui/Chip'
import ScrollableChipRow from '@/components/ui/ScrollableChipRow'

interface BoardFilterProps {
  categories: string[]
  boardSlug: string
}

export default function BoardFilter({ categories, boardSlug }: BoardFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const currentCategory = searchParams.get('category') || '전체'
  const displayCategories = categories.includes('전체')
    ? categories
    : ['전체', ...categories]

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
    <ScrollableChipRow innerClassName="py-2 pb-4" role="group" aria-label="카테고리 필터">
        {displayCategories.map((cat) => (
          <Chip
            key={cat}
            active={currentCategory === cat}
            className={isPending ? 'opacity-60' : undefined}
            onClick={() => handleSelect(cat)}
          >
            {cat}
          </Chip>
        ))}
    </ScrollableChipRow>
  )
}
