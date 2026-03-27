'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToastMessage {
  id: number
  text: string
  type: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  toast: (text: string, type?: ToastMessage['type']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const toast = useCallback((text: string, type: ToastMessage['type'] = 'success') => {
    const id = ++nextId
    setMessages((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }, 2500)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {messages.length > 0 && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none lg:bottom-24">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'px-6 py-3.5 rounded-2xl text-sm font-bold shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto',
                msg.type === 'success' && 'bg-foreground text-background',
                msg.type === 'error' && 'bg-destructive text-white',
                msg.type === 'info' && 'bg-primary text-white',
              )}
            >
              {msg.text}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
