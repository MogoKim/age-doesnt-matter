'use client'

import { SessionProvider } from 'next-auth/react'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  // refetchOnWindowFocus=false: 탭 포커스 복귀마다 /api/auth/session 재호출 억제.
  // JWT 세션(30일 maxAge)이라 포커스 시점 갱신이 불필요 → 불필요한 네트워크 제거.
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>
}
