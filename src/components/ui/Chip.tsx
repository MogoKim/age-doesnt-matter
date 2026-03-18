'use client'

import styles from './Chip.module.css'

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
      className={`${styles.chip} ${active ? styles.active : ''} ${className ?? ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
