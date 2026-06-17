import type { Grade, Role } from '@/generated/prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      grade: Grade
      nickname: string
      profileImage: string | null
      needsOnboarding: boolean
      fontSize?: string
      createdAt?: string  // ISO 8601 — 24시간 내 가입 여부 판단용
      firstGreetingAt?: string | null  // ISO 8601 — 첫 가입인사 작성 시각(null=미작성). 홈 첫인사 위젯 노출 판별용
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    role?: Role
    grade?: Grade
    nickname?: string
    profileImage?: string | null
    needsOnboarding?: boolean
    fontSize?: string
    createdAt?: string
    firstGreetingAt?: string | null
  }
}
