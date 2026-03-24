'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

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

  const btnBase = 'px-3 py-1.5 rounded-full text-[13px] font-bold cursor-pointer min-h-[52px] lg:min-h-[44px] transition-all'

  return (
    <div className="flex gap-1 mb-4" role="group" aria-label="정렬 방식">
      <button
        aria-pressed={current === 'latest'}
        className={`${btnBase} ${
          current === 'latest'
            ? 'bg-primary/5 border border-primary text-primary'
            : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
        }`}
        onClick={() => handleSort('latest')}
      >
        최신순
      </button>
      <button
        aria-pressed={current === 'likes'}
        className={`${btnBase} ${
          current === 'likes'
            ? 'bg-primary/5 border border-primary text-primary'
            : 'bg-none border border-transparent text-muted-foreground hover:bg-background'
        }`}
        onClick={() => handleSort('likes')}
      >
        공감순
      </button>
    </div>
  )
}
