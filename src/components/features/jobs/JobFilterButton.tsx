'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Chip from '@/components/ui/Chip'
import JobFilterPanel from './JobFilterPanel'

function FilterButtonInner() {
  const [showFilter, setShowFilter] = useState(false)
  const searchParams = useSearchParams()

  const hasFilters = searchParams.has('region') || searchParams.has('tags')

  return (
    <>
      <Chip
        active={hasFilters}
        muted
        onClick={() => setShowFilter(true)}
      >
        필터 ▼
      </Chip>
      {showFilter && <JobFilterPanel onClose={() => setShowFilter(false)} />}
    </>
  )
}

export default function JobFilterButton() {
  return (
    <Suspense fallback={<Chip muted>필터 ▼</Chip>}>
      <FilterButtonInner />
    </Suspense>
  )
}
