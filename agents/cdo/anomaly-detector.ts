import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyTelegram, notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CDO 에이전트 — 이상 감지
 * 매 시간: DAU 급락, 에러 급증 등 이상 감지
 */
class CDOAnomalyDetector extends BaseAgent {
  constructor() {
    super({
      name: 'CDO_ANOMALY',
      botType: 'CDO',
      role: 'CDO (이상 감지)',
      model: 'light',
      tasks: 'DAU 급락, 에러 급증 등 이상 징후 실시간 감지',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const anomalies: string[] = []

    // 최근 KPI 로그 2개 비교 (오늘 vs 어제)
    const recentKpis = await prisma.botLog.findMany({
      where: { botType: 'CDO', action: 'KPI_DAILY' },
      orderBy: { createdAt: 'desc' },
      take: 2,
    })

    if (recentKpis.length >= 2) {
      try {
        const today = JSON.parse(recentKpis[0].details ?? '{}')
        const yesterday = JSON.parse(recentKpis[1].details ?? '{}')

        // DAU 30% 이상 하락
        if (yesterday.dau > 0 && today.dau / yesterday.dau < 0.7) {
          anomalies.push(`DAU 급락: ${yesterday.dau} → ${today.dau} (${((1 - today.dau / yesterday.dau) * 100).toFixed(0)}% 하락)`)
        }

        // 신고 급증 (전일 대비 3배 이상)
        if (yesterday.reports > 0 && today.reports >= yesterday.reports * 3) {
          anomalies.push(`신고 급증: ${yesterday.reports} → ${today.reports}건`)
        }
      } catch {
        // KPI 파싱 실패 무시
      }
    }

    // 에러 이벤트 급증 (최근 1시간 vs 이전 1시간)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

    const [recentErrors, prevErrors] = await Promise.all([
      prisma.eventLog.count({ where: { eventName: { startsWith: 'error' }, createdAt: { gte: oneHourAgo } } }),
      prisma.eventLog.count({ where: { eventName: { startsWith: 'error' }, createdAt: { gte: twoHoursAgo, lt: oneHourAgo } } }),
    ])

    if (recentErrors > 10 && (prevErrors === 0 || recentErrors >= prevErrors * 3)) {
      anomalies.push(`에러 급증: ${prevErrors} → ${recentErrors}건/시간`)
    }

    if (anomalies.length > 0) {
      await notifyTelegram({
        level: 'critical',
        agent: 'CDO',
        title: '이상 징후 감지',
        body: anomalies.join('\n'),
      })

      await notifyAdmin({
        level: 'critical',
        agent: 'CDO',
        title: '이상 징후 감지',
        body: anomalies.join('\n'),
      })
    }

    return {
      agent: 'CDO_ANOMALY',
      success: true,
      summary: anomalies.length > 0 ? `이상 ${anomalies.length}건: ${anomalies.join('; ')}` : '이상 없음',
      data: { anomalies, recentErrors, prevErrors },
    }
  }
}

const agent = new CDOAnomalyDetector()
agent.execute().then((result) => {
  console.log('[CDO] 이상 감지:', result.summary)
  process.exit(0)
})
