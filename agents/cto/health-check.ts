import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CTO 에이전트 — 헬스체크
 * 매 1시간: DB 연결 + 사이트 응답 확인
 */
class CTOHealthCheck extends BaseAgent {
  constructor() {
    super({
      name: 'CTO',
      botType: 'CTO',
      role: 'CTO (기술총괄)',
      model: 'light',
      tasks: '헬스체크: DB 연결, 사이트 응답 시간, 에러 모니터링',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const checks: Array<{ name: string; ok: boolean; latencyMs: number; error?: string }> = []

    // 1. DB 연결 체크
    const dbStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.push({ name: 'Database', ok: true, latencyMs: Date.now() - dbStart })
    } catch (err) {
      checks.push({ name: 'Database', ok: false, latencyMs: Date.now() - dbStart, error: String(err) })
    }

    // 2. 사이트 응답 체크
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.SITE_URL ?? 'https://www.age-doesnt-matter.com'
    const siteStart = Date.now()
    try {
      const res = await fetch(siteUrl, { signal: AbortSignal.timeout(10_000), headers: { 'x-bot-type': 'cto-agent' } })
      checks.push({ name: 'Website', ok: res.ok, latencyMs: Date.now() - siteStart, error: res.ok ? undefined : `HTTP ${res.status}` })
    } catch (err) {
      checks.push({ name: 'Website', ok: false, latencyMs: Date.now() - siteStart, error: String(err) })
    }

    // 3. API 응답 체크
    const apiStart = Date.now()
    try {
      const res = await fetch(`${siteUrl}/api/best`, { signal: AbortSignal.timeout(10_000), headers: { 'x-bot-type': 'cto-agent' } })
      checks.push({ name: 'API', ok: res.ok, latencyMs: Date.now() - apiStart, error: res.ok ? undefined : `HTTP ${res.status}` })
    } catch (err) {
      checks.push({ name: 'API', ok: false, latencyMs: Date.now() - apiStart, error: String(err) })
    }

    const allOk = checks.every((c) => c.ok)
    const failed = checks.filter((c) => !c.ok)

    if (!allOk) {
      await notifySlack({
        level: 'critical',
        agent: 'CTO',
        title: '헬스체크 실패',
        body: failed.map((f) => `${f.name}: ${f.error}`).join('\n'),
      })
    }

    const dbMs = checks[0]?.latencyMs ?? 0
    const siteMs = checks[1]?.latencyMs ?? 0
    const apiMs = checks[2]?.latencyMs ?? 0

    const summary = allOk
      ? `모든 시스템 정상 (DB ${dbMs}ms, Site ${siteMs}ms, API ${apiMs}ms)`
      : `장애 감지: ${failed.map((f) => f.name).join(', ')}`

    // 성능 추세 분석을 위해 latencyMs를 구조화된 형식으로 저장
    // BotLog.details에 JSON 저장 → 7일 이동평균 등 추세 분석에 활용
    return {
      agent: 'CTO',
      success: allOk,
      summary,
      data: {
        latency: { db: dbMs, site: siteMs, api: apiMs },
        checks,
      },
    }
  }
}

const agent = new CTOHealthCheck()
agent.execute().then((result) => {
  console.log('[CTO] 헬스체크:', result.summary)
  process.exit(result.success ? 0 : 1)
})
