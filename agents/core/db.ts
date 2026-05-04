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
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
  const u = new URL(url)

  const pool = new Pool({
    host: u.hostname,
    port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    // NOTE: Supabase PgBouncer uses self-signed cert → rejectUnauthorized:true fails
    // Full cert validation requires SUPABASE_SSL_CA secret (future improvement)
    ssl: { rejectUnauthorized: false },
    max: 3,                    // GHA 프로세스당 최대 3개 (src/lib/prisma.ts 동일)
    idleTimeoutMillis: 10000,  // 유휴 연결 10초 후 해제
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
