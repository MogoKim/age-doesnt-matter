'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const VALID_SIZES = ['NORMAL', 'LARGE', 'XLARGE'] as const
type FontSizeValue = typeof VALID_SIZES[number]
const LS_KEY = 'unao-font-size'
const COOKIE_KEY = 'unao-font-size'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1년

/** 설정을 만지지 않은 사용자(신규 포함)의 기본 글자 크기.
 *  ⚠️ layout.tsx <head> inline script의 폴백과 반드시 같은 값으로 유지할 것 — 다르면 첫 페인트에 크기 점프가 생긴다. */
const DEFAULT_SIZE: FontSizeValue = 'LARGE'

// ── Context ──────────────────────────────────────────────────────────────────
interface FontSizeContextValue {
  fontSize: FontSizeValue
  setFontSize: (size: FontSizeValue) => void
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: DEFAULT_SIZE,
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
// NORMAL도 속성으로 명시한다 — "설정을 안 만짐(=LARGE)"과 "기본을 직접 고름(=NORMAL)"을 DOM에서 구분하기 위함.
// globals.css에는 LARGE/XLARGE 규칙만 있어 NORMAL은 어디에도 안 걸리고 :root(본문 18px)가 그대로 적용된다.
function applyFontSize(size: FontSizeValue) {
  document.documentElement.setAttribute('data-font-size', size)
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
    return DEFAULT_SIZE
  })

  // 마운트 시: localStorage 폴백 (서버 값 없는 비로그인 첫 접속)
  // 저장값이 없으면 DEFAULT_SIZE 유지 — head script가 이미 같은 값을 DOM에 적용해둔 상태다.
  // NORMAL→LARGE 1회 승격은 head script가 끝내므로 여기서는 저장값을 그대로 신뢰하면 된다.
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
