import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { notifyAdmin, notifyTelegram } from './notifier.js'
import type { AgentResult, AgentConfig, AgentLog } from './types.js'
import { prisma } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const constitution = readFileSync(resolve(__dirname, 'constitution.yaml'), 'utf-8')

const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const MODEL_LIGHT = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

export abstract class BaseAgent {
  protected client: Anthropic
  protected model: string
  protected config: AgentConfig

  constructor(config: AgentConfig) {
    this.client = new Anthropic()
    this.model = config.model === 'heavy' ? MODEL_HEAVY : MODEL_LIGHT
    this.config = config
  }

  protected getSystemPrompt(): string {
    return `당신은 "우리 나이가 어때서" 커뮤니티의 ${this.config.role}입니다.
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
  }

  protected async chat(userMessage: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: this.getSystemPrompt(),
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type === 'text') return block.text
    return JSON.stringify(block)
  }

  protected async log(action: string, status: AgentLog['status'], details?: string, costUsd?: number, durationMs = 0): Promise<void> {
    try {
      await prisma.botLog.create({
        data: {
          botType: this.config.name,
          action,
          status: status === 'SUCCESS' ? 'SUCCESS' : status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
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
    try {
      const result = await this.run()
      const durationMs = Date.now() - start

      await this.log('run', 'SUCCESS', result.summary, undefined, durationMs)

      return { ...result, durationMs, timestamp: new Date().toISOString() }
    } catch (err) {
      const durationMs = Date.now() - start
      const errorMsg = err instanceof Error ? err.message : String(err)

      await this.log('run', 'FAILURE', errorMsg, undefined, durationMs)

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
