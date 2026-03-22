import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 진단용
export let _debugHost = 'not-initialized'
export let _debugUser = 'not-initialized'

function parseDbUrl(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
  }
}

function createPrismaClient() {
  const raw = process.env.NODE_ENV === 'production'
    ? (process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '')
    : (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '')

  const parsed = parseDbUrl(raw)
  _debugHost = `${parsed.host}:${parsed.port}`
  _debugUser = parsed.user

  // 개별 파라미터로 전달하여 URL 파싱 문제 방지
  const pool = new Pool({
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
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
