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
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold min-h-[44px] cursor-pointer transition-all border ${
          hasFilters
            ? 'bg-primary text-white border-primary'
            : 'bg-card text-muted-foreground border-border hover:border-primary/30'
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
    <Suspense fallback={<button className="px-4 py-2 rounded-full text-sm font-bold min-h-[44px] bg-card text-muted-foreground border border-border">필터 ▼</button>}>
      <FilterButtonInner />
    </Suspense>
  )
}
