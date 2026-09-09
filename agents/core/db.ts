import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
// 타입만 가져온다 — 런타임 로딩은 아래 동적 import 그대로다(Node 20/24 확장자 차이 대응).
// 이게 없으면 prisma 가 `unknown` 이라 모든 모델 접근이 TS18046 이 되고,
// 그 결과 콜백 파라미터까지 implicit any 로 번진다(ops tsc 오류 대부분의 뿌리였다).
import type { PrismaClient } from '../../src/generated/prisma/client'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientBase = path.resolve(__dirname, '../../src/generated/prisma/client')

// Node 20 (GitHub Actions) → .js import works via tsx
// Node 24 (로컬) → .ts dynamic import needed
let PrismaClientCtor: new (opts: Record<string, unknown>) => PrismaClient
try {
  const mod = await import(`${clientBase}.js`)
  PrismaClientCtor = mod.PrismaClient
} catch {
  const mod = await import(`${clientBase}.ts`)
  PrismaClientCtor = mod.PrismaClient
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
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

  return new PrismaClientCtor({ adapter: new PrismaPg(pool) })
}

export const prisma: PrismaClient = createPrismaClient()

let _disconnected = false
export async function disconnect() {
  if (_disconnected) return
  _disconnected = true
  await prisma.$disconnect()
}
