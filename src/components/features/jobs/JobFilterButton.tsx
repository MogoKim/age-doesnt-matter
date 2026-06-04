'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import JobFilterPanel from './JobFilterPanel'

function FilterButtonInner() {
  const [showFilter, setShowFilter] = useState(false)
  const searchParams = useSearchParams()

  const hasFilters = searchParams.has('region') || searchParams.has('tags')

  return (
    <>
      <button
        className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-body font-medium min-h-[52px] cursor-pointer transition-all border-2 ${
          hasFilters
            ? 'bg-primary/10 text-primary-text border-primary font-bold'
            : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary-text hover:bg-primary/5'
        }`}
        onClick={() => setShowFilter(true)}
      >
        필터 ▼
      </button>
      {showFilter && <JobFilterPanel onClose={() => setShowFilter(false)} />}
    </>
  )
}

export default function JobFilterButton() {
  return (
    <Suspense fallback={<button className="shrink-0 px-4 py-2.5 rounded-full text-body font-medium min-h-[52px] bg-card text-muted-foreground border-2 border-border">필터 ▼</button>}>
      <FilterButtonInner />
    </Suspense>
  )
}
