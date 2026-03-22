import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // DIRECT_URL: Supabase 직접 연결 (port 5432) — prepared statements 지원
  // DATABASE_URL: transaction pooler (port 6543) — PgBouncer가 prepared statements 미지원
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ''

  const adapter = new PrismaPg({
    connectionString,
    // Vercel 등 프로덕션 환경에서 Supabase SSL 필요
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
