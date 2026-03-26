'use client'

import { useEffect } from 'react'

const VALID_SIZES = ['NORMAL', 'LARGE', 'XLARGE'] as const
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
    const size = VALID_SIZES.includes(effectiveSize as typeof VALID_SIZES[number])
      ? effectiveSize
      : 'NORMAL'

    // data 속성으로 폰트 크기 전환 — CSS 변수가 자동 반영됨
    if (size === 'NORMAL') {
      document.documentElement.removeAttribute('data-font-size')
    } else {
      document.documentElement.setAttribute('data-font-size', size)
    }

    // 서버 값이 있으면 localStorage 동기화
    if (fontSize && fontSize !== stored) {
      localStorage.setItem(LS_KEY, fontSize)
    }

    return () => {
      document.documentElement.removeAttribute('data-font-size')
    }
  }, [fontSize])

  return <>{children}</>
}
