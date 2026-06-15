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
        return
      }

      const payload = await response.json() as unknown
      if (isSession(payload)) {
        setData(payload)
        setStatus('authenticated')
      } else {
        setData(null)
        setStatus('unauthenticated')
      }
    } catch {
      setData(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    void loadSession()
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
