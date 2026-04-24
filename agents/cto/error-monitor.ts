import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CTO 에이전트 — 에러 모니터링
 * 최근 1시간 이벤트 로그에서 error 이벤트 감지
 */
class CTOErrorMonitor extends BaseAgent {
  constructor() {
    super({
      name: 'CTO_ERROR',
      botType: 'CTO',
      role: 'CTO (에러 모니터링)',
      model: 'light',
      tasks: '에러 이벤트 감지 및 알림',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const errorEvents = await prisma.eventLog.findMany({
      where: {
        eventName: { startsWith: 'error' },
        createdAt: { gte: oneHourAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // 에러 유형별 그룹핑
    const grouped = new Map<string, number>()
    for (const event of errorEvents) {
      const props = event.properties as Record<string, unknown>
      const key = (props?.type as string) ?? event.eventName
      grouped.set(key, (grouped.get(key) ?? 0) + 1)
    }

    const details = Array.from(grouped.entries())
      .map(([type, count]) => `${type}: ${count}건`)
      .join('\n')

    if (errorEvents.length === 0) {
      return { agent: 'CTO_ERROR', success: true, summary: '최근 1시간 에러 없음' }
    }

    // 반복 패턴 감지: 전날 같은 시간대 BotLog에서 에러 수 비교
    // 어제 error-monitor 실행 결과를 읽어 오늘과 비교
    const twoDaysAgo = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25시간 전
    const oneDayAgo = new Date(Date.now() - 23 * 60 * 60 * 1000)  // 23시간 전
    const yesterdayLog = await prisma.botLog.findFirst({
      where: {
        botType: 'CTO',
        action: 'ERROR_MONITOR',
        status: 'SUCCESS',
        createdAt: { gte: twoDaysAgo, lte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    })

    // 어제 에러 수 파싱 (summary 형식: "최근 1시간 에러 N건 감지")
    let yesterdayCount = 0
    if (yesterdayLog?.details) {
      const match = /에러 (\d+)건/.exec(yesterdayLog.details)
      if (match) yesterdayCount = parseInt(match[1], 10)
    }

    const isRepeating = yesterdayCount > 0 && errorEvents.length >= yesterdayCount * 2
    const patternNote = isRepeating
      ? ` (어제 ${yesterdayCount}건 대비 2배 이상 — 반복 패턴 의심)`
      : yesterdayCount > 0 ? ` (어제 ${yesterdayCount}건)` : ''

    // 10건 이상이면 중요 알림
    if (errorEvents.length >= 10) {
      await notifyAdmin({
        level: isRepeating ? 'critical' : 'important',
        agent: 'CTO',
        title: `에러 급증 감지 (${errorEvents.length}건/1시간${patternNote})`,
        body: details,
      })
    }

    return {
      agent: 'CTO_ERROR',
      success: true,
      summary: `최근 1시간 에러 ${errorEvents.length}건 감지${patternNote}`,
      data: { total: errorEvents.length, byType: Object.fromEntries(grouped), yesterdayCount },
    }
  }
}

const agent = new CTOErrorMonitor()
agent.execute().then((result) => {
  console.log('[CTO] 에러 모니터:', result.summary)
  process.exit(0)
})
