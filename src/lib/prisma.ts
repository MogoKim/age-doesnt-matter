import { Pool } from 'pg'
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

  // pg.Pool을 직접 생성하여 SSL 설정을 확실히 전달
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
