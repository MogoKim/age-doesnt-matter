'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const SORTS = [
  { key: 'latest', label: '최신순' },
  { key: 'likes', label: '공감순' },
] as const

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
    <div className="flex" role="group" aria-label="정렬 방식">
      {SORTS.map(({ key, label }) => {
        const active = current === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => handleSort(key)}
            /* 코랄 pill 배경은 목록 위에서 버튼처럼 튀어 목록 시작점을 흐렸다.
               리스트 헤더답게 글자 강조 + 밑줄로만 활성을 표시한다.
               높이는 min-h-[52px]로 터치 타겟 규칙(52px)을 지킨다 — 이전 Chip은 48px였다.
               ⚠️ border-0을 먼저 둔다. globals.css의 button{border:none} 때문에 border-solid만
               주면 지정하지 않은 3면이 기본 굵기(medium)로 살아나 네모 박스가 된다(#238 함정). */
            className={`inline-flex min-h-[52px] items-center px-3 text-caption transition-colors ${
              active
                ? 'font-bold text-foreground border-0 border-b-2 border-solid border-primary'
                : 'font-medium text-muted-subtle border-0 border-b-2 border-solid border-transparent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
