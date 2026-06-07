'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const OPTIONS = [
  { v: '7', l: '7일' },
  { v: '30', l: '30일' },
  { v: 'all', l: '전체' },
]

export default function PeriodFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const cur = searchParams.get('period') ?? '30'

  return (
    <div className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          onClick={() => router.replace(`${pathname}?period=${o.v}`)}
          className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors ${
            cur === o.v ? 'bg-[#FF6F61] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}
