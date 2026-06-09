import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientBase = path.resolve(__dirname, '../../src/generated/prisma/client')

// Node 20 (GitHub Actions) → .js import works via tsx
// Node 24 (로컬) → .ts dynamic import needed
let PrismaClient: new (opts: Record<string, unknown>) => Record<string, unknown>
try {
  const mod = await import(`${clientBase}.js`)
  PrismaClient = mod.PrismaClient
} catch {
  const mod = await import(`${clientBase}.ts`)
  PrismaClient = mod.PrismaClient
}

function createPrismaClient() {
  // AGENT_DB_USE_DIRECT=true → DIRECT_URL(5432 직접연결) 우선.
  // GHA 크론을 Supavisor(6543) client lobby 200 경합에서 분리해 웹 인증 슬롯을 보호한다.
  // ⚠️ 5432는 Nano max_connections 60 한도(웹 백엔드와 공유) → 무거운/빈번 GHA 크론부터 단계적 적용.
  // 로컬 launchd 크롤러는 DIRECT_URL 호스트 DNS 미해석(IPv6 전용)이라 이 플래그를 켜지 않는다(기본 6543 유지).
  const useDirect = process.env.AGENT_DB_USE_DIRECT === 'true'
  const url = useDirect
    ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '')
    : (process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '')
  const u = new URL(url)
  const configuredPoolMax = Number.parseInt(process.env.AGENT_DB_POOL_MAX ?? '1', 10)
  const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : 1

  const pool = new Pool({
    host: u.hostname,
    port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    // NOTE: Supabase PgBouncer uses self-signed cert → rejectUnauthorized:true fails
    // Full cert validation requires SUPABASE_SSL_CA secret (future improvement)
    ssl: { rejectUnauthorized: false },
    max: poolMax,              // GHA agent는 여러 workflow가 겹치므로 기본 1개로 연결 포화 방지
    idleTimeoutMillis: 5000,  // 유휴 연결 5초 후 해제 — Supavisor client 슬롯 빠른 반납(200 포화 완화)
    connectionTimeoutMillis: 10000, // 연결 실패 10초 후 에러 발생
  })

  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

export const prisma = createPrismaClient()

let _disconnected = false
export async function disconnect() {
  if (_disconnected) return
  _disconnected = true
  await (prisma as { $disconnect: () => Promise<void> }).$disconnect()
}
