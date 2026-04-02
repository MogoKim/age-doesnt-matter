import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { notifyAdmin } from './notifier.js'
import type { AgentResult, AgentConfig, AgentLog } from './types.js'
import { prisma } from './db.js'


const __dirname = dirname(fileURLToPath(import.meta.url))
const constitution = readFileSync(resolve(__dirname, 'constitution.yaml'), 'utf-8')

const MODEL_STRATEGIC = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const MODEL_LIGHT = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

export abstract class BaseAgent {
  protected client: Anthropic
  protected model: string
  protected config: AgentConfig
  private lessons = ''

  constructor(config: AgentConfig) {
    this.client = new Anthropic()
    this.model = config.model === 'strategic' ? MODEL_STRATEGIC
               : config.model === 'heavy' ? MODEL_HEAVY
               : MODEL_LIGHT
    this.config = config
  }

  /**
   * Pattern C — BotLog 이력 학습
   * 최근 실패 로그를 Haiku로 분석해 교훈을 추출하고 시스템 프롬프트에 주입.
   * 마지막 실행이 FAILED일 때만 호출 (오버헤드 최소화).
   */
  private async learnFromHistory(): Promise<void> {
    try {
      type LogRow = { action: string; status: string; details: string | null; createdAt: Date }
      type BotLogFindMany = (args: unknown) => Promise<LogRow[]>
      const findMany = ((prisma as Record<string, Record<string, unknown>>).botLog.findMany as BotLogFindMany)

      const logs = await findMany({
        where: { botType: this.config.botType },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { action: true, status: true, details: true, createdAt: true },
      })

      const failures = logs.filter((l) => l.status === 'FAILED')
      if (failures.length === 0) return

      const logText = logs
        .map(
          (l) =>
            `[${l.createdAt.toISOString().slice(0, 10)}] ${l.action} → ${l.status}` +
            (l.details ? `: ${l.details.slice(0, 120)}` : ''),
        )
        .join('\n')

      const haiku = new Anthropic()
      const res = await haiku.messages.create({
        model: MODEL_LIGHT,
        max_tokens: 250,
        system:
          '에이전트 실행 로그를 분석해서 핵심 실패 패턴과 주의사항을 2-3줄로 요약해줘. 한국어로, 각 항목은 "- "로 시작.',
        messages: [{ role: 'user', content: `[${this.config.name} 실행 기록]\n${logText}` }],
      })

      const block = res.content[0]
      if (block.type === 'text' && block.text) this.lessons = block.text.trim()
    } catch {
      // 학습 실패해도 에이전트 실행에 영향 없음
    }
  }

  protected getSystemPrompt(): string {
    const base = `당신은 "우리 나이가 어때서" 커뮤니티의 ${this.config.role}입니다.
아래 회사 헌법을 항상 준수하세요:

${constitution}

당신의 역할: ${this.config.role}
담당 업무: ${this.config.tasks}

규칙:
- 모든 판단은 회사 헌법 기준으로
- 창업자 승인 필요 사항은 AdminQueue에 등록만
- 모든 액션은 AgentLog에 기록
- 불확실한 경우 실행 금지, 승인 요청
- DB write는 ${this.config.canWrite ? '허용됨' : '금지 — 읽기만 가능'}
`
    if (!this.lessons) return base
    return base + `\n## 과거 실행에서 학습한 교훈\n${this.lessons}\n`
  }

  protected async chat(userMessage: string, maxTokens?: number): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens ?? 1024,
      system: this.getSystemPrompt(),
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type === 'text') return block.text
    return JSON.stringify(block)
  }

  protected async log(action: string, status: AgentLog['status'], details?: string, _costUsd?: number, durationMs = 0): Promise<void> {
    try {
      type BotLogCreate = (args: unknown) => Promise<unknown>
      const create = ((prisma as Record<string, Record<string, unknown>>).botLog.create as BotLogCreate)
      await create({
        data: {
          botType: this.config.botType,
          action,
          status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          details,
          itemCount: 0,
          executionTimeMs: durationMs,
        },
      })
    } catch {
      console.error(`[${this.config.name}] Failed to write log`)
    }
  }

  async execute(): Promise<AgentResult> {
    const start = Date.now()

    // Pattern C: 마지막 실행이 실패였으면 이력 학습 후 시스템 프롬프트에 반영
    try {
      type LastRunRow = { status: string } | null
      type BotLogFindFirst = (args: unknown) => Promise<LastRunRow>
      const findFirst = ((prisma as Record<string, Record<string, unknown>>).botLog.findFirst as BotLogFindFirst)
      const lastRun = await findFirst({
        where: { botType: this.config.botType },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      })
      if (lastRun?.status === 'FAILED') await this.learnFromHistory()
    } catch { /* ignore */ }

    try {
      const result = await this.run()
      const durationMs = Date.now() - start

      await this.log('run', 'SUCCESS', result.summary, undefined, durationMs)

      return { ...result, durationMs, timestamp: new Date().toISOString() }
    } catch (err) {
      const durationMs = Date.now() - start
      const errorMsg = err instanceof Error ? err.message : String(err)

      await this.log('run', 'FAILED', errorMsg, undefined, durationMs)

      await notifyAdmin({
        level: 'important',
        agent: this.config.name,
        title: `${this.config.name} 실행 실패`,
        body: errorMsg,
      })

      return {
        agent: this.config.name,
        success: false,
        summary: errorMsg,
        error: errorMsg,
        durationMs,
        timestamp: new Date().toISOString(),
      }
    }
  }

  /** 서브클래스에서 구현 */
  protected abstract run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>>
}
