'use client'

import AppSessionProvider from '@/components/common/AppSessionProvider'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AppSessionProvider>{children}</AppSessionProvider>
}
