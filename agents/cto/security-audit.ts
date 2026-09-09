import { BaseAgent } from '../core/agent.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../core/db.js'
import { notifyAdmin, notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CTO 에이전트 — 보안 감사
 * 매일 06:00 KST (21:00 UTC) 실행
 * 보안 이상 징후 탐지: 로그인 실패, rate limit, 비용 이상, 어드민 액션
 */
class CTOSecurityAudit extends BaseAgent {
  constructor() {
    super({
      name: 'CTO_SECURITY',
      botType: 'CTO',
      role: 'CTO (보안 감사)',
      model: 'light',
      tasks: '일일 보안 감사: 로그인 실패, rate limit 위반, 비용 이상, 어드민 액션 검토',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const findings: string[] = []

    // 1. 로그인 실패 횟수 (EventLog에서 login_failed 이벤트)
    const loginFailures = await prisma.eventLog.count({
      where: {
        eventName: { startsWith: 'login_fail' },
        createdAt: { gte: oneDayAgo },
      },
    })
    if (loginFailures > 20) {
      findings.push(`🔴 로그인 실패 ${loginFailures}회 (24시간) — 브루트포스 가능성`)
    } else if (loginFailures > 5) {
      findings.push(`🟡 로그인 실패 ${loginFailures}회 (24시간)`)
    }

    // 2. 에러 이벤트 급증
    const errorCount = await prisma.eventLog.count({
      where: {
        eventName: { startsWith: 'error' },
        createdAt: { gte: oneDayAgo },
      },
    })
    if (errorCount > 50) {
      findings.push(`🔴 에러 이벤트 ${errorCount}건 (24시간) — 비정상 급증`)
    } else if (errorCount > 20) {
      findings.push(`🟡 에러 이벤트 ${errorCount}건 (24시간)`)
    }

    // 3. 에이전트 비용 이상 (BotLog에서 실행 시간 기준 추정)
    const expensiveRuns = await prisma.botLog.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
        executionTimeMs: { gte: 60000 }, // 1분 이상 실행
      },
      select: { botType: true, action: true, executionTimeMs: true },
      orderBy: { executionTimeMs: 'desc' },
      take: 5,
    })
    if (expensiveRuns.length > 0) {
      const longest = expensiveRuns[0]
      if (longest.executionTimeMs > 300000) { // 5분 이상
        findings.push(`🔴 비정상 장시간 실행: ${longest.botType} ${longest.action} (${Math.round(longest.executionTimeMs / 1000)}초)`)
      }
    }

    // 4. 어드민 액션 검토 (AdminAuditLog)
    const adminActions = await prisma.adminAuditLog.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { action: true, adminId: true, targetType: true, targetId: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const sensitiveActions = adminActions.filter(a =>
      a.action.includes('DELETE') || a.action.includes('BULK') || a.action.includes('BAN')
    )
    if (sensitiveActions.length > 0) {
      findings.push(`🟡 민감한 어드민 액션 ${sensitiveActions.length}건: ${sensitiveActions.map(a => a.action).join(', ')}`)
    }

    // 5. BotLog 실패율
    const totalRuns = await prisma.botLog.count({
      where: { createdAt: { gte: oneDayAgo } },
    })
    const failedRuns = await prisma.botLog.count({
      where: { createdAt: { gte: oneDayAgo }, status: 'FAILED' },
    })
    const failRate = totalRuns > 0 ? (failedRuns / totalRuns * 100).toFixed(1) : '0'
    if (failedRuns > 5) {
      findings.push(`🟡 에이전트 실패율 ${failRate}% (${failedRuns}/${totalRuns})`)
    }

    // 결과 리포트
    const status = findings.some(f => f.startsWith('🔴')) ? 'CRITICAL'
                 : findings.length > 0 ? 'WARNING'
                 : 'OK'

    const report = findings.length > 0
      ? findings.join('\n')
      : '✅ 24시간 내 보안 이상 징후 없음'

    // CRITICAL이면 긴급 알림
    if (status === 'CRITICAL') {
      await notifyAdmin({
        level: 'critical',
        agent: 'CTO_SECURITY',
        title: '🚨 보안 감사: CRITICAL 발견',
        body: report,
      })
    } else {
      await notifySlack({
        level: 'info',
        agent: 'CTO_SECURITY',
        title: `🔒 일일 보안 감사 [${status}]`,
        body: report,
      })
    }

    return {
      agent: 'CTO_SECURITY',
      success: true,
      summary: `보안 감사 완료 [${status}]: ${findings.length}건 발견`,
      data: { status, findings, loginFailures, errorCount, failRate },
    }
  }
}

/**
 * runner 가 **완료까지 기다릴 수 있도록** Promise 를 반환한다.
 *
 * 예전에는 top-level 에서 `agent.execute().then(...)` 을 시작만 했다. 그러면 runner 의
 * `import(...)` 은 모듈 로드 시점에 resolve 되고, runner 는 곧바로 `disconnect()` +
 * `process.exit()` 를 해서 감사가 첫 `await` 에서 잘렸다 — 초록불인데 아무것도 안 한 상태.
 * moderator 와 같은 계약으로 맞춘다.
 */
export async function main(): Promise<void> {
  const agent = new CTOSecurityAudit()
  const r = await agent.execute()
  console.log(r.summary)
}

// `tsx cto/security-audit.ts` 로 직접 돌릴 때만 실행한다.
// import 만으로 시작하면 runner 가 기다릴 Promise 가 다시 사라진다.
// 경로를 정확히 대조한다 — 부분일치로 판정하면 다른 진입점에서도 참이 되어 이중 실행이 된다.
const entry = process.argv[1]
const isDirect = entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)
if (isDirect) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1) })
}
