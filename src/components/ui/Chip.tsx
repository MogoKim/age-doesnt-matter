import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type ChipTone = 'soft' | 'solid'

interface ChipClassOptions {
  active?: boolean
  tone?: ChipTone
  muted?: boolean
  className?: string
}

export function chipClassName({
  active = false,
  tone = 'soft',
  muted = false,
  className,
}: ChipClassOptions = {}) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium leading-tight whitespace-nowrap transition-colors min-h-[48px] select-none',
    active
      ? tone === 'solid'
        ? 'border-primary bg-primary text-white font-bold'
        : 'border-primary bg-primary/10 text-primary-text font-bold'
      : cn(
          'border-border bg-card hover:border-primary hover:text-primary-text hover:bg-primary/5',
          muted ? 'text-muted-foreground' : 'text-foreground',
        ),
    className,
  )
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  tone?: ChipTone
  muted?: boolean
  label?: string
}

export default function Chip({
  active = false,
  tone = 'soft',
  muted = false,
  label,
  children,
  className,
  type = 'button',
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={props['aria-pressed'] ?? active}
      className={chipClassName({ active, tone, muted, className })}
      {...props}
    >
      {children ?? label}
    </button>
  )
}
