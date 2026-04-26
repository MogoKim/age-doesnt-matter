'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/components/common/FontSizeProvider'

const SIZES = [
  { key: 'NORMAL',  label: '가',  desc: '기본' },
  { key: 'LARGE',   label: '가',  desc: '크게' },
  { key: 'XLARGE',  label: '가',  desc: '매우 크게' },
] as const

export default function HeaderFontSizeToggle() {
  const { fontSize, setFontSize } = useFontSize()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-center w-[52px] h-[52px] rounded-xl text-muted-foreground transition-colors [-webkit-tap-highlight-color:transparent]',
          'hover:bg-primary/5 hover:text-primary-text',
          open && 'bg-primary/10 text-primary-text'
        )}
        aria-label="글씨 크기 조절"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="text-[18px] font-bold leading-none select-none">가</span>
      </button>

      {open && (
        <>
          {/* 백드롭 */}
          <div
            className="fixed inset-0 z-[110]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* 드롭다운 */}
          <div
            className="absolute right-0 top-[calc(100%+6px)] z-[111] bg-card border border-border rounded-2xl shadow-lg p-3 flex flex-col gap-1 min-w-[120px]"
            role="radiogroup"
            aria-label="글씨 크기 선택"
          >
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={fontSize === s.key}
                onClick={() => {
                  setFontSize(s.key)
                  setOpen(false)
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-colors',
                  fontSize === s.key
                    ? 'bg-primary/10 text-primary-text font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <span
                  className="font-bold leading-none select-none w-6 text-center"
                  style={{ fontSize: s.key === 'NORMAL' ? 14 : s.key === 'LARGE' ? 18 : 22 }}
                >
                  {s.label}
                </span>
                <span className="text-[15px]">{s.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
