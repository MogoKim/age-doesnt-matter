import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client.js'

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
  const u = new URL(url)

  const pool = new Pool({
    host: u.hostname,
    port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

export const prisma = createPrismaClient()

export async function disconnect() {
  await prisma.$disconnect()
}
