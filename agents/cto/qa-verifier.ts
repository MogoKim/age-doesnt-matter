import { readFileSync } from 'fs'
import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifySlack, sendQaReport } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * CTO QA Verifier — 3가지 모드
 * 1. QA_ALL_PASSED=true → 배포 QA 성공 리포트 (#qa 스레드)
 * 2. QA_SMOKE_RESULT 있음 → 배포 QA 실패 분석 (#qa 스레드 + #대시보드 cross-post)
 * 3. QA_MODE=cron-audit → 크론 실행 감사 (일 1회 23:45 KST)
 */

interface SmokeCheck {
  name: string
  passed: boolean
  detail?: string
}

interface CronCheck {
  handler: string
  linked: boolean
}

interface SmokeResult {
  version: string
  checks: SmokeCheck[]
}

interface CronResult {
  version: string
  handlers: CronCheck[]
}

const DAILY_EXPECTED: Array<{ botType: string; action: string; label: string }> = [
  { botType: 'CEO', action: 'MORNING_CYCLE', label: 'CEO 모닝' },
  { botType: 'CTO', action: 'HEALTH_CHECK', label: 'CTO 헬스체크' },
  { botType: 'CTO', action: 'SECURITY_AUDIT', label: 'CTO 보안감사' },
  { botType: 'CMO', action: 'TREND_ANALYSIS', label: 'CMO 트렌드' },
  { botType: 'COO', action: 'MODERATION', label: 'COO 중재' },
  { botType: 'COO', action: 'JOB_SCRAPE', label: 'COO 일자리' },
  { botType: 'COO', action: 'TRENDING_SCORE', label: 'COO 트렌딩' },
  { botType: 'CDO', action: 'KPI_DAILY', label: 'CDO KPI' },
  { botType: 'SEED', action: 'SCHEDULE', label: 'SEED 스케줄' },
  { botType: 'CFO', action: 'COST_TRACK', label: 'CFO 비용' },
  { botType: 'CAFE_CRAWLER', action: 'TREND_ANALYSIS', label: '카페 트렌드' },
  { botType: 'CAFE_CRAWLER', action: 'MAGAZINE_GENERATE', label: '매거진 생성' },
]

class CTOQAVerifier extends BaseAgent {
  constructor() {
    super({
      name: 'CTO',
      botType: 'CTO',
      role: 'CTO (QA 검증)',
      model: 'light',
      tasks: 'QA 검증: 배포 스모크 테스트 + 크론 실행 감사',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const mode = this.detectMode()

    if (mode === 'deploy-pass') return this.handleDeployPass()
    if (mode === 'deploy-fail') return this.handleDeployFail()
    return this.handleCronAudit()
  }

  private detectMode(): 'deploy-pass' | 'deploy-fail' | 'cron-audit' {
    if (process.env.QA_ALL_PASSED === 'true') return 'deploy-pass'
    if (process.env.QA_SMOKE_RESULT) return 'deploy-fail'
    if (process.env.QA_MODE === 'cron-audit') return 'cron-audit'
    return 'cron-audit'
  }

  private readJsonFile<T>(filePath: string): T | null {
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as T
    } catch {
      return null
    }
  }

  private async handleDeployPass(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const smoke = this.readJsonFile<SmokeResult>('smoke-result.json')
    const cron = this.readJsonFile<CronResult>('cron-result.json')

    const commitSha = process.env.GITHUB_SHA ?? 'unknown'
    const version = smoke?.version ?? cron?.version ?? 'unknown'
    const passed = smoke?.checks.filter((c) => c.passed).length ?? 0
    const total = smoke?.checks.length ?? 0
    const linked = cron?.handlers.filter((h) => h.linked).length ?? 0
    const cronTotal = cron?.handlers.length ?? 0

    // #qa 채널에 스레드 리포트
    const results = [
      {
        name: 'Smoke Test',
        passed: process.env.QA_SMOKE_RESULT !== 'failure',
        detail: `${passed}/${total} 체크 통과 (v${version})`,
      },
      {
        name: 'Cron 연결',
        passed: process.env.QA_CRON_RESULT !== 'failure',
        detail: `${linked}/${cronTotal} 핸들러 연결 정상`,
      },
      {
        name: '광고 검증',
        passed: process.env.QA_AD_VERIFY_RESULT !== 'failure',
        detail: process.env.QA_AD_VERIFY_RESULT === 'failure'
          ? '광고 렌더링 검증 실패'
          : '광고 렌더링 검증 통과',
      },
    ]

    await sendQaReport({ commitSha, results })

    const summary = `배포 QA 통과 — ${commitSha.slice(0, 7)}`
    return { agent: 'CTO', success: true, summary }
  }

  private async handleDeployFail(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const smoke = this.readJsonFile<SmokeResult>('smoke-result.json')
    const cron = this.readJsonFile<CronResult>('cron-result.json')

    const commitSha = process.env.GITHUB_SHA ?? 'unknown'
    const checks = smoke?.checks ?? []
    const failed = checks.filter((c) => !c.passed)
    const total = checks.length

    const failSummary = failed.map((f) => `• ${f.name} — ${f.detail ?? '원인 불명'}`).join('\n')

    const analysis = await this.chat(
      `배포 QA에서 아래 항목이 실패했습니다. 각 항목의 원인과 조치 방안을 간단히 분석해주세요.\n\n${failSummary}`
    )

    // #qa 채널에 스레드 리포트
    const results = [
      {
        name: 'Smoke Test',
        passed: process.env.QA_SMOKE_RESULT !== 'failure',
        detail: process.env.QA_SMOKE_RESULT === 'failure'
          ? `실패 ${failed.length}/${total}: ${failed.map((f) => f.name).join(', ')}`
          : `${total - failed.length}/${total} 체크 통과`,
      },
      {
        name: 'Cron 연결',
        passed: process.env.QA_CRON_RESULT !== 'failure',
        detail: process.env.QA_CRON_RESULT === 'failure'
          ? '크론 연결 검증 실패'
          : `${cron?.handlers.filter((h) => h.linked).length ?? 0}/${cron?.handlers.length ?? 0} 연결 정상`,
      },
      {
        name: '광고 검증',
        passed: process.env.QA_AD_VERIFY_RESULT !== 'failure',
        detail: process.env.QA_AD_VERIFY_RESULT === 'failure'
          ? '광고 렌더링 검증 실패'
          : '광고 렌더링 검증 통과',
      },
    ]

    await sendQaReport({ commitSha, results, analysis })

    return {
      agent: 'CTO',
      success: false,
      summary: `배포 QA 실패 — ${commitSha.slice(0, 7)}`,
      data: { analysis },
    }
  }

  private async handleCronAudit(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const today = new Date()
    today.setHours(today.getHours() + 9) // KST
    const kstDate = today.toISOString().slice(0, 10)
    const startOfDay = new Date(`${kstDate}T00:00:00+09:00`)
    const endOfDay = new Date(`${kstDate}T23:59:59+09:00`)

    const logs = await prisma.botLog.findMany({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
        status: 'SUCCESS',
      },
      select: { botType: true, action: true },
    })

    const executed = new Set(logs.map((l) => `${l.botType}:${l.action}`))
    const missing = DAILY_EXPECTED.filter((e) => !executed.has(`${e.botType}:${e.action}`))

    if (missing.length === 0) {
      const summary = `크론 QA 정상 — ${DAILY_EXPECTED.length}개 에이전트 모두 실행 완료`
      await notifySlack({ level: 'info', agent: 'CTO', title: '크론 QA 정상', body: summary })
      return { agent: 'CTO', success: true, summary }
    }

    const missingList = missing.map((m) => `• ${m.label} (${m.botType}:${m.action})`).join('\n')
    const body = `크론 미실행 에이전트 (${missing.length}/${DAILY_EXPECTED.length}):\n${missingList}`

    await notifySlack({ level: 'important', agent: 'CTO', title: '크론 미실행 감지', body })

    return {
      agent: 'CTO',
      success: false,
      summary: `크론 미실행 ${missing.length}개: ${missing.map((m) => m.label).join(', ')}`,
      data: { missing: missing.map((m) => m.label) },
    }
  }
}

const agent = new CTOQAVerifier()
agent.execute().then((result) => {
  console.log('[CTO] QA 검증:', result.summary)
  process.exit(result.success ? 0 : 1)
})
