'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const VALID_SIZES = ['NORMAL', 'LARGE', 'XLARGE'] as const
type FontSizeValue = typeof VALID_SIZES[number]
const LS_KEY = 'unao-font-size'
const COOKIE_KEY = 'unao-font-size'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1년

// ── Context ──────────────────────────────────────────────────────────────────
interface FontSizeContextValue {
  fontSize: FontSizeValue
  setFontSize: (size: FontSizeValue) => void
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: 'NORMAL',
  setFontSize: () => {},
})

export function useFontSize() {
  return useContext(FontSizeContext)
}

// ── 쿠키 저장 헬퍼 ───────────────────────────────────────────────────────────
function saveFontSizeCookie(size: FontSizeValue) {
  try {
    document.cookie = `${COOKIE_KEY}=${size}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
  } catch {
    // 쿠키 설정 실패 시 무시 (localStorage 폴백으로 충분)
  }
}

// ── DOM 적용 헬퍼 ────────────────────────────────────────────────────────────
function applyFontSize(size: FontSizeValue) {
  if (size === 'NORMAL') {
    document.documentElement.removeAttribute('data-font-size')
  } else {
    document.documentElement.setAttribute('data-font-size', size)
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────
interface FontSizeProviderProps {
  /** JWT 또는 쿠키로부터 서버가 결정한 초기값 (없으면 localStorage 폴백) */
  initialSize?: string
  /** 하위 호환 — (main)/layout.tsx에서 전달하던 fontSize prop */
  fontSize?: string
  children: React.ReactNode
}

export default function FontSizeProvider({
  initialSize,
  fontSize,
  children,
}: FontSizeProviderProps) {
  // 서버 결정값 우선순위: initialSize > fontSize(JWT)
  const serverSize = initialSize ?? fontSize

  const [current, setCurrent] = useState<FontSizeValue>(() => {
    // 서버 값이 유효하면 사용 (SSR hydration 일치)
    if (serverSize && VALID_SIZES.includes(serverSize as FontSizeValue)) {
      return serverSize as FontSizeValue
    }
    return 'NORMAL'
  })

  // 마운트 시: localStorage 폴백 (서버 값 없는 비로그인 첫 접속)
  useEffect(() => {
    if (!serverSize) {
      const stored = localStorage.getItem(LS_KEY)
      if (stored && VALID_SIZES.includes(stored as FontSizeValue)) {
        setCurrent(stored as FontSizeValue)
        applyFontSize(stored as FontSizeValue)
      }
    } else {
      // 서버 값 있으면 DOM 확정 적용 (html 속성이 이미 세팅됐지만 명시적 동기화)
      applyFontSize(current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // current 변경 시 DOM 적용
  useEffect(() => {
    applyFontSize(current)
  }, [current])

  function setFontSize(size: FontSizeValue) {
    setCurrent(size)
    applyFontSize(size)
    localStorage.setItem(LS_KEY, size)
    saveFontSizeCookie(size)
  }

  return (
    <FontSizeContext.Provider value={{ fontSize: current, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  )
}
