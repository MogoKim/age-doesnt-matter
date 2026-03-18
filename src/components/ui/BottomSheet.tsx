'use client'

import { useEffect, useCallback, useState } from 'react'
import styles from './BottomSheet.module.css'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export default function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const [exiting, setExiting] = useState(false)

  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(() => {
      setExiting(false)
      onClose()
    }, 300)
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, handleClose])

  if (!open && !exiting) return null

  return (
    <div className={exiting ? styles.exit : undefined} role="dialog" aria-modal="true">
      <div className={styles.overlay} onClick={handleClose} />
      <div className={styles.sheet}>
        <div className={styles.handle} />
        {children}
      </div>
    </div>
  )
}
