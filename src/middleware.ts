import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * 미들웨어 — auth.config.ts 사용 (Prisma 미포함, Edge Runtime 호환)
 * 인증 보호 로직은 authConfig.callbacks.authorized에서 처리
 */
export default NextAuth(authConfig).auth

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
