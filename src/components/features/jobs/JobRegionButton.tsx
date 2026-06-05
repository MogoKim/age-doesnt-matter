'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import JobRegionSheet from './JobRegionSheet'

function RegionButtonInner() {
  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()
  const region = searchParams.get('region') ?? ''

  return (
    <>
      <button
        className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-body font-medium min-h-[52px] cursor-pointer transition-all border-2 ${
          region
            ? 'bg-primary/10 text-primary-text border-primary font-bold'
            : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary-text hover:bg-primary/5'
        }`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {region || '지역'} ▼
      </button>
      {open && <JobRegionSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export default function JobRegionButton() {
  return (
    <Suspense
      fallback={
        <button className="shrink-0 px-4 py-2.5 rounded-full text-body font-medium min-h-[52px] bg-card text-muted-foreground border-2 border-border">
          지역 ▼
        </button>
      }
    >
      <RegionButtonInner />
    </Suspense>
  )
}
