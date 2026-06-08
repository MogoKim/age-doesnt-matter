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
  const configuredPoolMax = Number.parseInt(process.env.WEB_DB_POOL_MAX ?? '', 10)
  const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : (isProduction ? 3 : 10)

  const pool = new Pool({
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    // ⚠️ Supavisor(6543) client 연결 한도 200개 — 여러 Vercel 인스턴스 × pool + 에이전트가 이를 공유한다.
    // pool을 키우면(인스턴스당 점유 ↑) 트래픽 많을 때 200을 더 빨리 소진해 전체가 연결을 못 얻는다.
    // 그래서 production 기본 3개로 보수적 유지. 속도는 인덱스/캐시로 푼다(연결 추가 X).
    // 2026-06-08: 8로 올렸다가 연결 포화(EMAXCONN) 확인하고 3으로 복귀. WEB_DB_POOL_MAX로 조정 가능.
    max: poolMax,
    // 10초: warm Lambda가 유휴 Supavisor(client) 슬롯을 빠르게 반납해 200 한도 포화 완화
    // transaction mode라 재연결 저렴 → 짧게 잡아도 안전(과단축 시 재연결 오버헤드라 10초 절충)
    idleTimeoutMillis: isProduction ? 10000 : 30000,
    connectionTimeoutMillis: 10000,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// 서버리스 환경에서도 동일 invocation 내 재사용
globalForPrisma.prisma = prisma
