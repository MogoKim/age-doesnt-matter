import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Supabase 연결 전략:
 * - Vercel(production): DATABASE_URL → transaction pooler (port 6543) + SSL
 * - 로컬(development): DIRECT_URL → direct connection (port 5432)
 *
 * pg.Pool을 직접 생성하고 개별 파라미터로 전달하여
 * URL 파싱 문제를 방지합니다.
 */
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

  const isProduction = process.env.NODE_ENV === 'production'

  const pool = new Pool({
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    // 서버리스 환경: Supabase 무료 티어 제한 대응 (직접 연결 ~60개 / PgBouncer 경유)
    max: 5,
    idleTimeoutMillis: isProduction ? 10000 : 30000,
    connectionTimeoutMillis: 10000,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// 서버리스 환경에서도 동일 invocation 내 재사용
globalForPrisma.prisma = prisma
