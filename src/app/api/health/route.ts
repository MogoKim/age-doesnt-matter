import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, string> = {}
  let healthy = true

  // DB 연결 확인
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    checks.database = 'ok'
  } catch (e) {
    checks.database = 'error'
    checks.dbError = e instanceof Error ? e.message : String(e)
    healthy = false
  }

  // 환경변수 존재 여부 (값은 노출하지 않음)
  const env = {
    hasDirect: !!process.env.DIRECT_URL,
    hasDatabase: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  }

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      env,
    },
    { status: healthy ? 200 : 503 }
  )
}
