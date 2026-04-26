'use client'

import { cn } from '@/lib/utils'
import { useFontSize } from '@/components/common/FontSizeProvider'

const SIZES = [
  { key: 'NORMAL', label: '가', class: 'text-[14px]' },
  { key: 'LARGE',  label: '가', class: 'text-[18px]' },
  { key: 'XLARGE', label: '가', class: 'text-[22px]' },
] as const

export default function FooterFontSizeToggle() {
  const { fontSize, setFontSize } = useFontSize()

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="글씨 크기 조절">
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={fontSize === s.key}
          onClick={() => setFontSize(s.key)}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg border transition-colors',
            s.class,
            fontSize === s.key
              ? 'border-primary bg-primary/10 text-foreground font-bold'
              : 'border-border text-muted-foreground hover:border-primary/50'
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
