import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Supabase 연결 전략 (Vercel 서버리스 환경):
 *
 * - Direct (db.xxx.supabase.co:5432): Vercel에서 접근 불가 (IPv6/네트워크 제한)
 * - Session Pooler (pooler.supabase.com:5432): prepared statements 지원 + Vercel 접근 가능 ✓
 * - Transaction Pooler (pooler.supabase.com:6543): prepared statements 미지원
 *
 * DATABASE_URL(port 6543)을 Session Pooler(port 5432)로 자동 변환합니다.
 */
function toSessionPooler(url: string): string {
  if (!url) return url
  // transaction pooler (port 6543) → session pooler (port 5432)
  return url.replace(/:6543\//, ':5432/')
}

// 진단용: 실제 사용 중인 연결 호스트
export let _debugHost = 'not-initialized'

function createPrismaClient() {
  // SESSION_POOL_URL > DATABASE_URL(→ session pooler로 변환) > DIRECT_URL(로컬용)
  const connectionString = process.env.SESSION_POOL_URL
    ?? (toSessionPooler(process.env.DATABASE_URL ?? '') || process.env.DIRECT_URL || '')

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
