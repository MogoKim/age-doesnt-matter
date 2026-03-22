import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 진단용: 실제 사용 중인 연결 호스트
export let _debugHost = 'not-initialized'

function createPrismaClient() {
  // Vercel: DATABASE_URL(transaction pooler, port 6543) 사용
  // 로컬: DIRECT_URL(direct connection, port 5432) 우선
  const connectionString = process.env.NODE_ENV === 'production'
    ? (process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '')
    : (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '')

  try {
    const u = new URL(connectionString)
    _debugHost = `${u.hostname}:${u.port}`
  } catch {
    _debugHost = 'parse-error'
  }

  // Supabase SSL: rejectUnauthorized=false로 self-signed 인증서 허용
  const ssl = process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined

  const adapter = new PrismaPg({
    connectionString,
    ssl,
  } as Record<string, unknown>)

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
