import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * ⚠️ 극한 격리 테스트 — 완전 최소 설정
 * 원래 코드: git show HEAD~2:src/lib/auth.ts
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
})
