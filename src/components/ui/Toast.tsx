'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ToastMessage {
  id: number
  icon: string
  message: string
  exiting: boolean
}

interface ToastContextValue {
  show: (message: string, icon?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string, icon = '✅', duration = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const id = ++idRef.current
    setToast({ id, icon, message, exiting: false })

    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? { ...prev, exiting: true } : prev))
      setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev))
      }, 200)
    }, duration)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div
            className={cn(
              'flex items-center gap-2 px-6 py-4 bg-card border border-border rounded-xl shadow-md text-sm font-medium text-foreground whitespace-nowrap pointer-events-auto',
              toast.exiting ? 'animate-out fade-out-0 slide-out-to-top-4' : 'animate-in fade-in-0 slide-in-from-top-4',
            )}
            role="alert"
          >
            <span>{toast.icon}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
