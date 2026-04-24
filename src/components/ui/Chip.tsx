'use client'

import { cn } from '@/lib/utils'

interface ChipProps {
  label: string
  active?: boolean
  onClick?: () => void
  className?: string
}

export default function Chip({ label, active = false, onClick, className }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center min-h-[52px] px-4 rounded-full border whitespace-nowrap select-none transition-colors lg:min-h-[48px]',
        active
          ? 'border-primary bg-primary text-white font-bold'
          : 'border-border bg-background text-foreground hover:border-primary',
        className,
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
