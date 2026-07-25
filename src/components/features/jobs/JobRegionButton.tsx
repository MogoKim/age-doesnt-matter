'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Chip from '@/components/ui/Chip'
import JobRegionSheet from './JobRegionSheet'

function RegionButtonInner() {
  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()
  const region = searchParams.get('region') ?? ''

  return (
    <>
      <Chip
        active={Boolean(region)}
        muted
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {region || '지역'} ▼
      </Chip>
      {open && <JobRegionSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export default function JobRegionButton() {
  return (
    <Suspense
      fallback={
        <Chip muted>
          지역 ▼
        </Chip>
      }
    >
      <RegionButtonInner />
    </Suspense>
  )
}
