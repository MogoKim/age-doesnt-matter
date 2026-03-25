import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin, notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

const MONTHLY_BUDGET_USD = 50
const WARNING_THRESHOLD_USD = 40

/**
 * CFO 에이전트 — 비용 추적
 * 매일 23:00: API 사용량, 인프라 비용 집계
 */
class CFOCostTracker extends BaseAgent {
  constructor() {
    super({
      name: 'CFO',
      botType: 'CFO',
      role: 'CFO (재무총괄)',
      model: 'light',
      tasks: '일일 비용 체크, CPS/광고 수익 집계, 예산 경고',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // 1. 에이전트 실행 횟수 (이번 달)
    const agentRuns = await prisma.botLog.count({
      where: { createdAt: { gte: monthStart } },
    })

    // 2. 에이전트별 실행 횟수
    const agentBreakdown = await prisma.botLog.groupBy({
      by: ['botType'],
      where: { createdAt: { gte: monthStart } },
      _count: true,
    })

    // 비용 추정 (에이전트 실행당 평균 비용)
    // Haiku: ~$0.001/실행, Sonnet: ~$0.01/실행
    const heavyAgents = ['CEO', 'CMO', 'CPO']
    let estimatedCost = 0
    for (const agent of agentBreakdown) {
      const costPerRun = heavyAgents.includes(agent.botType) ? 0.01 : 0.001
      estimatedCost += agent._count * costPerRun
    }

    // 3. 예산 경고
    if (estimatedCost >= WARNING_THRESHOLD_USD) {
      await notifySlack({
        level: 'critical',
        agent: 'CFO',
        title: `예산 경고: $${estimatedCost.toFixed(2)} / $${MONTHLY_BUDGET_USD}`,
        body: `이번 달 예상 비용이 경고 수준($${WARNING_THRESHOLD_USD})에 도달했습니다.\n에이전트 실행 ${agentRuns}회`,
      })
    }

    const summary = `이번 달 예상 비용: $${estimatedCost.toFixed(2)}/${MONTHLY_BUDGET_USD} (에이전트 ${agentRuns}회 실행)`

    await notifyAdmin({
      level: estimatedCost >= WARNING_THRESHOLD_USD ? 'important' : 'info',
      agent: 'CFO',
      title: '일일 비용 리포트',
      body: summary,
    })

    return {
      agent: 'CFO',
      success: true,
      summary,
      data: {
        estimatedCostUsd: estimatedCost,
        budgetUsd: MONTHLY_BUDGET_USD,
        agentRuns,
        breakdown: Object.fromEntries(agentBreakdown.map((a) => [a.botType, a._count])),
      },
    }
  }
}

const agent = new CFOCostTracker()
agent.execute().then((result) => {
  console.log('[CFO] 비용 추적:', result.summary)
  process.exit(0)
})
