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
    <form onSubmit={handleSearch} className="mt-6">
      <div className="flex flex-wrap gap-2">
        {/* 검색 범위 드롭다운 */}
        <div className="relative">
          <select
            aria-label="검색 범위"
            value={field}
            onChange={(e) => setField(e.target.value as SearchField)}
            className="min-h-[52px] appearance-none rounded-xl border border-border bg-background py-2 pl-4 pr-10 text-base text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {FIELD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* 검색 입력 */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어를 입력하세요"
          className="min-h-[52px] min-w-[140px] flex-1 rounded-xl border border-border bg-background px-4 py-2 text-base text-foreground outline-none transition-colors placeholder:text-foreground/50 focus:border-primary/60"
        />

        {/* 검색 버튼 */}
        <button
          type="submit"
          className="min-h-[52px] whitespace-nowrap rounded-xl border border-primary/30 bg-primary/10 px-6 py-2 text-base font-bold text-primary-text transition-colors hover:bg-primary/15"
        >
          검색
        </button>

        {/* 초기화 버튼 (검색 중일 때만) */}
        {currentQ && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[52px] whitespace-nowrap rounded-xl border border-border px-4 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            초기화
          </button>
        )}
      </div>

      {currentQ && (
        <p className="mt-2 text-[17px] font-medium text-primary-text">
          &ldquo;{currentQ}&rdquo; 검색 결과
        </p>
      )}
    </form>
  )
}
