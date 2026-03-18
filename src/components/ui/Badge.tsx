import type { Grade } from '@/types/api'
import { GRADE_EMOJI, GRADE_LABEL } from '@/types/api'

interface BadgeProps {
  grade: Grade
  showLabel?: boolean
  className?: string
}

const GRADE_COLORS: Record<Grade, string> = {
  SPROUT: 'var(--color-grade-sprout)',
  REGULAR: 'var(--color-grade-regular)',
  VETERAN: 'var(--color-grade-veteran)',
  WARM_NEIGHBOR: 'var(--color-grade-warm-neighbor)',
}

export default function Badge({ grade, showLabel = false, className }: BadgeProps) {
  return (
    <span
      className={className}
      style={{ color: GRADE_COLORS[grade], fontSize: 'var(--font-size-xs)' }}
    >
      {GRADE_EMOJI[grade]}
      {showLabel && ` ${GRADE_LABEL[grade]}`}
    </span>
  )
}
