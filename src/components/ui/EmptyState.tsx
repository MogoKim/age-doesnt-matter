import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: string
  message: string
  sub?: string
  children?: React.ReactNode
  className?: string
}

export default function EmptyState({
  icon = '📭',
  message,
  sub,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center gap-2', className)}>
      <span className="text-5xl mb-2" aria-hidden="true">
        {icon}
      </span>
      <p className="text-lg font-medium text-foreground">{message}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
