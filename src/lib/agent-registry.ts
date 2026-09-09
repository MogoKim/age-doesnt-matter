/**
 * 에이전트 핸들러 레지스트리 — 어드민 현황 탭에서 쓴다.
 * (모닝 리포트 에이전트는 R4 에서 제거됐다 — 2026-09-08)
 *
 * 계약은 한 방향뿐이다: **여기 있는 키는 전부 runner.ts HANDLERS 에 있어야 한다.**
 * runner 에 없는 키를 두면 어드민이 없는 작업을 돌아가는 것처럼 보여준다.
 * 반대(runner 의 모든 키가 여기 있어야 한다)는 계약이 아니다.
 *
 * 이 방향은 `src/__tests__/agent-registry-handlers.test.ts` 가 지킨다.
 */

export type HandlerRunType = 'GHA' | 'LOCAL' | 'DISPATCH'

export interface HandlerMeta {
  key: string           // runner.ts 키 (예: 'coo:moderator')
  label: string         // 한국어 이름
  botType: string       // BotLog.botType 매칭용
  action: string | null // BotLog.action 매칭용 (null = 매칭 불가)
  schedule: string      // KST 실행 시간 표시용
  type: HandlerRunType
  workflow?: string     // .github/workflows/ 파일명 (GHA만)
  note?: string         // 특이사항
}

export const HANDLER_REGISTRY: HandlerMeta[] = [
  // ─── CEO ───────────────────────────────────────────────────────────

  // ─── CTO ───────────────────────────────────────────────────────────
  { key: 'cto:security-audit',       label: 'CTO 보안 감사',      botType: 'CTO',          action: 'SECURITY_AUDIT',         schedule: '매일 06:00',           type: 'GHA',      workflow: 'agents-daily' },

  // ─── COO ───────────────────────────────────────────────────────────
  { key: 'coo:moderator',             label: 'COO 모더레이션',    botType: 'COO', action: 'MODERATION',           schedule: '09:00, 15:00, 21:00',  type: 'GHA', workflow: 'agents-moderation' },
  { key: 'coo:job-scraper',           label: 'COO 일자리 수집',   botType: 'COO', action: 'JOB_SCRAPE',           schedule: '12:00, 16:00, 20:00',  type: 'GHA', workflow: 'agents-jobs' },

  // ─── CDO ───────────────────────────────────────────────────────────

  // ─── QA ────────────────────────────────────────────────────────────

  // ─── COMMUNITY ─────────────────────────────────────────────────────

  // ─── CAFE CRAWLER ──────────────────────────────────────────────────

  // ─── DESIGN ────────────────────────────────────────────────────────
]

/** 팀별 그룹핑 (어드민 UI용) */
export const HANDLER_GROUPS = [
  { team: 'CTO',          emoji: '🔧', keys: ['cto:security-audit'] },
  { team: 'COO',          emoji: '⚙️', keys: ['coo:moderator','coo:job-scraper'] },
]
