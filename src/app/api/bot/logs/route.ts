import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'
import type { BotType, BotStatus } from '@/generated/prisma/client'

const VALID_BOT_TYPES: BotType[] = ['JOB', 'HUMOR', 'STORY', 'THREAD']
const VALID_STATUSES: BotStatus[] = ['SUCCESS', 'PARTIAL', 'FAILED']

/** POST /api/bot/logs — 봇 실행 로그 기록 */
export async function POST(req: NextRequest) {
  const auth = authenticateBot(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { botType, status, collectedCount, filteredCount, publishedCount, reviewPendingCount, logData } = body

    if (!botType) {
      return NextResponse.json({ error: 'botType 필수' }, { status: 400 })
    }

    if (!VALID_BOT_TYPES.includes(botType)) {
      return NextResponse.json({ error: `botType은 ${VALID_BOT_TYPES.join(', ')} 중 하나` }, { status: 400 })
    }

    const log = await prisma.botLog.create({
      data: {
        botType,
        status: VALID_STATUSES.includes(status) ? status : 'SUCCESS',
        collectedCount: collectedCount ?? 0,
        filteredCount: filteredCount ?? 0,
        publishedCount: publishedCount ?? 0,
        reviewPendingCount: reviewPendingCount ?? 0,
        logData: logData ?? undefined,
      },
    })

    return NextResponse.json({ success: true, logId: log.id })
  } catch (err) {
    console.error('[Bot/Logs] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
