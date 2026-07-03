'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

type SearchField = 'both' | 'title' | 'content'

function parseSf(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content' || raw === 'both') return raw
  return 'both'
}

const FIELD_OPTIONS: Array<{ value: SearchField; label: string }> = [
  { value: 'title', label: '제목' },
  { value: 'content', label: '내용' },
  { value: 'both', label: '제목+내용' },
]

export default function CategorySearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentQ = searchParams.get('q')
  const currentSf = parseSf(searchParams.get('sf'))

  const [field, setField] = useState<SearchField>(currentSf)
  const [query, setQuery] = useState(currentQ ?? '')

  useEffect(() => {
    setQuery(currentQ ?? '')
    setField(currentSf)
  }, [currentQ, currentSf])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (query.trim()) {
      params.set('q', query.trim())
      params.set('sf', field)
    } else {
      params.delete('q')
      params.delete('sf')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function handleClear() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    params.delete('sf')
    params.delete('page')
    setQuery('')
    setField('both')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    // 1줄 고정: [검색범위 select] [검색어 input(flex-1 min-w-0)] [검색 button]. 줄바꿈 금지, 모두 52px.
    <form onSubmit={handleSearch} className="mt-6">
      <div className="flex items-center gap-2">
        {/* 검색 범위 드롭다운 */}
        <div className="relative shrink-0">
          <select
            aria-label="검색 범위"
            value={field}
            onChange={(e) => setField(e.target.value as SearchField)}
            className="h-[52px] appearance-none rounded-xl border border-border bg-background pl-3.5 pr-9 text-base font-medium text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {FIELD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* 검색 입력 — flex-1 min-w-0 로 남는 폭 차지(1줄 유지), 초기화 X는 input 내부 */}
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어"
            className="h-[52px] w-full min-w-0 rounded-xl border border-border bg-background pl-4 pr-11 text-base text-foreground outline-none transition-colors placeholder:text-foreground/50 focus:border-primary/60"
          />
          {currentQ && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        {/* 검색 버튼 — 코랄 fill + 돋보기 아이콘(작은 폭에서도 인식), aria-label */}
        <button
          type="submit"
          aria-label="검색"
          className="flex h-[52px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-base font-bold text-white transition-colors hover:bg-primary/90"
        >
          <svg className="h-[19px] w-[19px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
          </svg>
          검색
        </button>
      </div>

      {currentQ && (
        <p className="mt-2.5 text-[17px] font-semibold text-primary-text">
          &ldquo;{currentQ}&rdquo; 검색 결과
        </p>
      )}
    </form>
  )
}
