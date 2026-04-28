'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const SIZES = [
  { key: 'NORMAL', label: '가', class: 'text-[14px]' },
  { key: 'LARGE', label: '가', class: 'text-[18px]' },
  { key: 'XLARGE', label: '가', class: 'text-[22px]' },
] as const

const LS_KEY = 'unao-font-size'

export default function FooterFontSizeToggle() {
  const [current, setCurrent] = useState('NORMAL')

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored && ['NORMAL', 'LARGE', 'XLARGE'].includes(stored)) {
      setCurrent(stored)
    }
  }, [])

  function handleChange(size: string) {
    setCurrent(size)
    localStorage.setItem(LS_KEY, size)
    if (size === 'NORMAL') {
      document.documentElement.removeAttribute('data-font-size')
    } else {
      document.documentElement.setAttribute('data-font-size', size)
    }
  }

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="글씨 크기 조절">
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={current === s.key}
          onClick={() => handleChange(s.key)}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg border transition-colors',
            s.class,
            current === s.key
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
