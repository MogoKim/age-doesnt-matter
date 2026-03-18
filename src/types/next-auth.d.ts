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
  }
}
