'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type SearchField = 'both' | 'title' | 'content'

const FIELD_OPTIONS: Array<{ value: SearchField; label: string }> = [
  { value: 'both', label: '제목+내용' },
  { value: 'title', label: '제목' },
  { value: 'content', label: '내용' },
]

export default function CategorySearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentQ = searchParams.get('q')
  const [field, setField] = useState<SearchField>(
    (searchParams.get('sf') as SearchField | null) ?? 'both',
  )
  const [query, setQuery] = useState(currentQ ?? '')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
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
    setQuery('')
    setField('both')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSearch}
      className="mt-6 rounded-2xl border border-border bg-card p-4"
    >
      <p className="mb-3 text-sm font-semibold text-foreground">글 검색</p>

      {/* 검색 범위 선택 */}
      <div className="mb-3 flex gap-1.5">
        {FIELD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setField(opt.value)}
            className={cn(
              'min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              field === opt.value
                ? 'bg-primary text-white'
                : 'border border-border bg-background text-muted-foreground hover:border-primary/40',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 검색 입력 */}
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어를 입력하세요"
          className="h-[52px] flex-1 rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
        <button
          type="submit"
          className="h-[52px] whitespace-nowrap rounded-xl bg-primary px-6 text-base font-bold text-white transition-colors hover:bg-primary/90"
        >
          검색
        </button>
        {currentQ && (
          <button
            type="button"
            onClick={handleClear}
            className="h-[52px] whitespace-nowrap rounded-xl border border-border px-4 text-base font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            초기화
          </button>
        )}
      </div>

      {currentQ && (
        <p className="mt-2 text-sm font-medium text-primary">
          &ldquo;{currentQ}&rdquo; 검색 결과
        </p>
      )}
    </form>
  )
}
