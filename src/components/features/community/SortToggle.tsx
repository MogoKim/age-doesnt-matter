'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import Chip from '@/components/ui/Chip'

export default function SortToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('sort') === 'likes' ? 'likes' : 'latest'

  const handleSort = useCallback(
    (sort: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (sort === 'latest') {
        params.delete('sort')
      } else {
        params.set('sort', sort)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="flex gap-1" role="group" aria-label="정렬 방식">
      <Chip
        active={current === 'latest'}
        className={current === 'latest' ? undefined : 'bg-transparent border-transparent hover:bg-background'}
        onClick={() => handleSort('latest')}
      >
        최신순
      </Chip>
      <Chip
        active={current === 'likes'}
        className={current === 'likes' ? undefined : 'bg-transparent border-transparent hover:bg-background'}
        onClick={() => handleSort('likes')}
      >
        공감순
      </Chip>
    </div>
  )
}
