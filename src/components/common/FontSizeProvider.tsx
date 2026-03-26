'use client'

import { useEffect } from 'react'

const FONT_SIZE_MAP: Record<string, string> = {
  NORMAL: '17px',
  LARGE: '20px',
  XLARGE: '24px',
}

const LS_KEY = 'unao-font-size'

interface FontSizeProviderProps {
  fontSize?: string
  children: React.ReactNode
}

export default function FontSizeProvider({ fontSize, children }: FontSizeProviderProps) {
  useEffect(() => {
    // 서버 prop 우선, 없으면 localStorage 폴백 (비로그인/캐시)
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    const effectiveSize = fontSize ?? stored ?? 'NORMAL'
    const size = FONT_SIZE_MAP[effectiveSize] ?? FONT_SIZE_MAP.NORMAL
    document.documentElement.style.setProperty('--font-body', size)

    // 서버 값이 있으면 localStorage 동기화
    if (fontSize && fontSize !== stored) {
      localStorage.setItem(LS_KEY, fontSize)
    }

    return () => {
      document.documentElement.style.removeProperty('--font-body')
    }
  }, [fontSize])

  // 초기 렌더링 시 깜빡임 방지: localStorage에서 즉시 읽어 inline script 주입
  // (useEffect 전에 적용되는 blocking script)
  return <>{children}</>
}
