'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

export interface FaqItem {
  q: string
  a: ReactNode
}

export function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-card hover:bg-accent/50 transition-colors min-h-[52px] cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="text-body font-bold text-foreground pr-4">{item.q}</span>
        <span
          className="text-xl text-muted-foreground shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-card border-t border-border text-body text-foreground leading-[1.85]">
          {item.a}
        </div>
      )}
    </div>
  )
}
