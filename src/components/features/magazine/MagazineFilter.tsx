'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import Chip from '@/components/ui/Chip'
import ScrollableChipRow from '@/components/ui/ScrollableChipRow'

const MAGAZINE_CATEGORIES = ['전체', '건강', '재테크', '은퇴준비', '일자리', '생활', '여행', '문화', '요리']

export default function MagazineFilter({ currentCategory }: { currentCategory?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('category') || currentCategory || '전체'

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
    <ScrollableChipRow innerClassName="py-2 pb-4 mb-4" role="group" aria-label="매거진 카테고리 필터">
        {MAGAZINE_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            active={active === cat}
            onClick={() => handleSelect(cat)}
          >
            {cat}
          </Chip>
        ))}
    </ScrollableChipRow>
  )
}
