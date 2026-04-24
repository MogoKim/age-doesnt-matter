import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack, notifyAdmin } from '../core/notifier.js'
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

    // DAU 비율 알림 최소 샘플 — 10명 미만은 1명 차이로 100% 급락이 발생해 오탐
    const MIN_DAU_SAMPLE = 10

    if (recentKpis.length >= 2) {
      try {
        const today = JSON.parse(recentKpis[0].details ?? '{}')
        const yesterday = JSON.parse(recentKpis[1].details ?? '{}')

        // DAU 30% 이상 하락 — 소량 샘플(< 10명) 구간은 비율 알림 억제
        if (yesterday.dau >= MIN_DAU_SAMPLE && today.dau / yesterday.dau < 0.7) {
          anomalies.push(`DAU 급락: ${yesterday.dau} → ${today.dau} (${((1 - today.dau / yesterday.dau) * 100).toFixed(0)}% 하락)`)
        } else if (yesterday.dau > 0 && yesterday.dau < MIN_DAU_SAMPLE && today.dau === 0) {
          // 소량 구간: 절대값 0 → CRITICAL 억제, WARNING 수준 기록만
          anomalies.push(`🟡 DAU 0 감지 (소량 샘플: 어제 ${yesterday.dau}명 — 비율 알림 억제)`)
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
