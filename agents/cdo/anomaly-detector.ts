import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack, notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CDO 에이전트 — 이상 감지
 * 매 시간: 에러 급증 등 이상 감지
 */
class CDOAnomalyDetector extends BaseAgent {
  constructor() {
    super({
      name: 'CDO_ANOMALY',
      botType: 'CDO',
      role: 'CDO (이상 감지)',
      model: 'light',
      tasks: '에러 급증 등 이상 징후 실시간 감지',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const anomalies: string[] = []

    // DAU·신고 급증 비교는 CDO:KPI_DAILY 생산자(cdo:kpi-collector)가 R4 에서 제거되면서
    // 읽을 데이터가 사라져 함께 걷어냈다 (2026-09-08). 아래 에러 급증 감지는 EventLog 를
    // 직접 읽으므로 그대로 동작한다.

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
      // 🟡 prefix = 소량 샘플 경고(warning), 없으면 = CRITICAL
      const criticalAnomalies = anomalies.filter(a => !a.startsWith('🟡'))
      const warningAnomalies = anomalies.filter(a => a.startsWith('🟡'))

      if (criticalAnomalies.length > 0) {
        // 24h 쿨다운 (read-only — canWrite:false CDO 제약 준수)
        // BaseAgent.execute()가 summary를 BotLog에 기록하므로 [ALERTED] 태그 조회만으로 충분
        const recentAlerted = await prisma.botLog.findFirst({
          where: {
            botType: 'CDO',
            action: 'run',
            summary: { contains: '[ALERTED]' },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (recentAlerted) {
          return {
            agent: 'CDO_ANOMALY',
            success: true,
            summary: `[쿨다운] 이상 ${criticalAnomalies.length}건 감지됐으나 24h 내 알림 발송됨`,
            data: { anomalies, recentErrors, prevErrors, cooldown: true },
          }
        }

        await notifySlack({
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
      } else if (warningAnomalies.length > 0) {
        // 경고 수준만 존재 — Slack warning만 전송, 쿨다운 없음
        await notifySlack({
          level: 'warning',
          agent: 'CDO',
          title: '이상 징후 감지 (경고)',
          body: warningAnomalies.join('\n'),
        })
      }
    }

    return {
      agent: 'CDO_ANOMALY',
      success: true,
      // [ALERTED] 태그 → BaseAgent.execute()가 BotLog에 기록 → 다음 실행 시 24h 쿨다운 트리거
      summary: anomalies.some(a => !a.startsWith('🟡'))
        ? `[ALERTED] 이상 ${anomalies.length}건: ${anomalies.join('; ')}`
        : anomalies.length > 0
          ? `이상 ${anomalies.length}건(경고): ${anomalies.join('; ')}`
          : '이상 없음',
      data: { anomalies, recentErrors, prevErrors },
    }
  }
}

const agent = new CDOAnomalyDetector()
agent.execute().then((result) => {
  console.log('[CDO] 이상 감지:', result.summary)
  process.exit(0)
})
