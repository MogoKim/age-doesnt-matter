'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from 'next-auth'

type AppSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AppSessionValue {
  status: AppSessionStatus
  data: Session | null
  user: Session['user'] | null
  isLoggedIn: boolean
  refetch: () => Promise<void>
}

const AppSessionContext = createContext<AppSessionValue | null>(null)

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const user = (value as { user?: unknown }).user
  if (!user || typeof user !== 'object') return false
  return typeof (user as { id?: unknown }).id === 'string'
}

// ── 비회원 첫 진입 최적화 (perf 1차, 2026-07-12) ──────────────────────────
// 세션 쿠키(next-auth)는 httpOnly라 JS에서 직접 볼 수 없으므로, "인증된 적 있음" 힌트를
// localStorage에 남겨 판별한다. 힌트가 없으면(=비회원 첫 진입 대부분) status를 즉시
// 'unauthenticated'로 확정해 세션 의존 UI(헤더 로그인 버튼 등)가 loading 없이 바로 그려지고,
// /api/auth/session(no-store) 호출은 크리티컬 윈도 밖(idle)으로 후행한다(자기교정 1회 —
// localStorage만 지워진 로그인 사용자를 놓치지 않기 위한 안전망). 힌트가 있으면 기존과 동일하게
// 즉시 fetch(status 'loading' 시작 — 로그인 UI 깜빡임 방지). refetch()는 기존과 동일.
const SESSION_HINT_KEY = 'unao_session_hint'

function hasSessionHint(): boolean {
  try {
    if (window.localStorage.getItem(SESSION_HINT_KEY) === '1') return true
  } catch { /* localStorage 불가 환경 → 힌트 없음 취급 */ }
  // httpOnly가 아닌 배포 설정 대비 겸용 — 보이면 확실한 로그인 신호
  return /(?:^|;\s*)(?:__Secure-)?(?:authjs|next-auth)\.session-token=/.test(document.cookie)
}

function writeSessionHint(authenticated: boolean): void {
  try {
    if (authenticated) window.localStorage.setItem(SESSION_HINT_KEY, '1')
    else window.localStorage.removeItem(SESSION_HINT_KEY)
  } catch { /* localStorage 불가 환경 무시 */ }
}

export default function AppSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppSessionStatus>('loading')
  const [data, setData] = useState<Session | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        setData(null)
        setStatus('unauthenticated')
        writeSessionHint(false)
        return
      }

      const payload = await response.json() as unknown
      if (isSession(payload)) {
        setData(payload)
        setStatus('authenticated')
        writeSessionHint(true)
      } else {
        setData(null)
        setStatus('unauthenticated')
        writeSessionHint(false)
      }
    } catch {
      setData(null)
      setStatus('unauthenticated')
      // 네트워크 오류는 로그아웃 확정이 아님 — 힌트 보존(다음 로드에서 재검증)
    }
  }, [])

  useEffect(() => {
    if (hasSessionHint()) {
      // 로그인 이력 있음 → 기존 동작 그대로 즉시 검증 (loading → authenticated/unauthenticated)
      void loadSession()
      return
    }
    // 비회원(힌트 없음) → 즉시 확정 + idle 자기교정 1회 (첫 페인트/LCP 경로에서 세션 호출 제거)
    setStatus('unauthenticated')
    let idleId: number | undefined
    let timerId: number | undefined
    const verify = () => { void loadSession() }
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(verify, { timeout: 3000 })
    } else {
      timerId = window.setTimeout(verify, 1500)
    }
    return () => {
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [loadSession])

  // 로그인 성공 시 "최근 로그인" 마커 기록(재방문 넛지용 — /login 배지에서 읽음).
  // 세션 로직 무관, 마커 기록만. 로그아웃해도 삭제하지 않음(다음 재방문 넛지 유지).
  useEffect(() => {
    if (status !== 'authenticated') return
    try {
      window.localStorage.setItem('unao_last_login', 'kakao')
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, [status])

  const value = useMemo<AppSessionValue>(() => ({
    status,
    data,
    user: data?.user ?? null,
    isLoggedIn: status === 'authenticated',
    refetch: loadSession,
  }), [data, loadSession, status])

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  )
}

export function useAppSession(): AppSessionValue {
  const value = useContext(AppSessionContext)
  if (!value) {
    throw new Error('useAppSession must be used within AppSessionProvider')
  }
  return value
}
