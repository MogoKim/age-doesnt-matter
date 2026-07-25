import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScrollableChipRowProps {
  children: ReactNode
  className?: string
  innerClassName?: string
  fadeClassName?: string
  role?: string
  'aria-label'?: string
  fade?: boolean
}

export default function ScrollableChipRow({
  children,
  className,
  innerClassName,
  fadeClassName,
  role,
  'aria-label': ariaLabel,
  fade = true,
}: ScrollableChipRowProps) {
  return (
    <div className={cn('relative min-w-0 overflow-hidden', className)}>
      <div
        className={cn(
          'flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          innerClassName,
        )}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {fade && (
        <div
          className={cn(
            'absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none',
            fadeClassName,
          )}
        />
      )}
    </div>
  )
}
