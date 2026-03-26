'use client'

import { useEffect } from 'react'

const FONT_SIZE_MAP: Record<string, string> = {
  NORMAL: '17px',
  LARGE: '20px',
  XLARGE: '24px',
}

interface FontSizeProviderProps {
  fontSize?: string
  children: React.ReactNode
}

export default function FontSizeProvider({ fontSize, children }: FontSizeProviderProps) {
  useEffect(() => {
    const size = FONT_SIZE_MAP[fontSize ?? 'NORMAL'] ?? FONT_SIZE_MAP.NORMAL
    document.documentElement.style.setProperty('--font-body', size)
    return () => {
      document.documentElement.style.removeProperty('--font-body')
    }
  }, [fontSize])

  return <>{children}</>
}
