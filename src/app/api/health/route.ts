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

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
