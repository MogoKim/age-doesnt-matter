'use client'

import BottomSheet from './BottomSheet'
import Button from './Button'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  isLoading?: boolean
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'primary',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h3
        style={{
          font: 'var(--font-h3)',
          marginBottom: message ? 'var(--space-sm)' : 'var(--space-lg)',
        }}
      >
        {title}
      </h3>
      {message && (
        <p
          style={{
            font: 'var(--font-body)',
            color: 'var(--color-text-sub)',
            marginBottom: 'var(--space-lg)',
          }}
        >
          {message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  )
}
