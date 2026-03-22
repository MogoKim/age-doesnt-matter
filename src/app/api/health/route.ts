import { NextResponse } from 'next/server'
import { prisma, _debugHost } from '@/lib/prisma'

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

  // 환경변수 진단 (호스트+포트만, 값은 노출하지 않음)
  function extractHost(url?: string) {
    if (!url) return null
    try {
      const u = new URL(url)
      return `${u.hostname}:${u.port}`
    } catch { return 'parse-error' }
  }
  const env = {
    hasDirect: !!process.env.DIRECT_URL,
    hasDatabase: !!process.env.DATABASE_URL,
    directHost: extractHost(process.env.DIRECT_URL),
    dbHost: extractHost(process.env.DATABASE_URL),
    nodeEnv: process.env.NODE_ENV,
    activeHost: _debugHost,
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
