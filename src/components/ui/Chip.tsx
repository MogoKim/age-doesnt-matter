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
        'inline-flex items-center justify-center h-9 px-4 text-xs rounded-full border whitespace-nowrap select-none transition-colors',
        active
          ? 'border-primary bg-primary/5 text-primary font-medium'
          : 'border-border bg-background text-muted-foreground hover:border-primary',
        className,
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
