/** 에이전트 실행 결과 */
export interface AgentResult {
  agent: string
  success: boolean
  summary: string
  data?: Record<string, unknown>
  error?: string
  durationMs: number
  timestamp: string
}

/** 알림 레벨 */
export type NotifyLevel = 'critical' | 'important' | 'info'

/** 알림 페이로드 */
export interface NotifyPayload {
  level: NotifyLevel
  agent: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/** MCP 컨텍스트 — 에이전트가 접근 가능한 외부 시스템 */
export interface MCPContext {
  db: {
    query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>
  }
  github: {
    createIssue: (title: string, body: string, labels?: string[]) => Promise<string>
  }
  r2: {
    upload: (key: string, buffer: Buffer, contentType: string) => Promise<string>
  }
}

/** 에이전트 로그 (DB에 기록) */
export interface AgentLog {
  agent: string
  action: string
  status: 'SUCCESS' | 'FAILURE' | 'SKIPPED'
  details?: string
  costUsd?: number
  durationMs: number
  createdAt: Date
}

/** 미팅 타입 */
export type MeetingType = 'MORNING' | 'PROBLEM' | 'WEEKLY' | 'RETRO'

/** 미팅 액션 아이템 */
export interface MeetingAction {
  assignee: string
  task: string
  deadline: string
}

/** 에이전트 설정 */
export interface AgentConfig {
  name: string
  role: string
  model: 'heavy' | 'light'
  tasks: string
  canWrite: boolean
}

/** Cron 스케줄 엔트리 */
export interface CronEntry {
  time: string
  agent: string
  task: string
  handler: string
}
