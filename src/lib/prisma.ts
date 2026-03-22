import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function ensureSsl(url: string): string {
  if (!url) return url
  const sep = url.includes('?') ? '&' : '?'
  if (!url.includes('sslmode=')) return `${url}${sep}sslmode=require`
  return url
}

function createPrismaClient() {
  // DIRECT_URL: Supabase 직접 연결 (port 5432) — prepared statements 지원
  // DATABASE_URL: transaction pooler (port 6543) — PgBouncer가 prepared statements 미지원
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ''
  const connectionString = process.env.NODE_ENV === 'production' ? ensureSsl(raw) : raw

  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
