'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { IconSearch } from '@/components/icons'

interface JobSearchBarProps {
  defaultValue?: string
}

export default function JobSearchBar({ defaultValue }: JobSearchBarProps) {
  const [query, setQuery] = useState(defaultValue ?? '')
  const [error, setError] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    setQuery(defaultValue ?? '')
    setError('')
  }, [defaultValue])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length === 1) {
      setError('두 글자 이상 입력해 주세요')
      return
    }
    setError('')
    const params = new URLSearchParams(searchParams.toString())
    if (q.length >= 2) {
      params.set('q', q)
      params.set('sf', 'both')
    } else {
      params.delete('q')
      params.delete('sf')
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="mb-3">
      <form
        role="search"
        aria-label="일자리 검색"
        onSubmit={handleSubmit}
        className="flex items-center h-[52px] bg-card border border-border rounded-xl px-4 gap-2 focus-within:border-primary transition-colors"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError('') }}
          placeholder="직종, 지역, 급여 조건 검색"
          aria-label="일자리 검색어"
          className="flex-1 border-none bg-transparent outline-none text-body placeholder:text-muted-foreground min-h-[48px]"
        />
        <button
          type="submit"
          aria-label="검색"
          className="shrink-0 flex items-center justify-center w-[52px] h-[52px] -mr-4 rounded-r-xl text-muted-foreground hover:text-primary-text transition-colors"
        >
          <IconSearch size={20} />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1 ml-1 text-[17px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
