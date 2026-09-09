/**
 * 에이전트 핸들러 레지스트리 — 어드민 현황 탭 + 모닝 리포트 공통 사용
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
  { key: 'ceo:approval-reminder',    label: 'CEO 승인 리마인더',  botType: 'CEO',          action: 'APPROVAL_REMIND',        schedule: '매일 09:30',           type: 'GHA',      workflow: 'agents-daily' },

  // ─── CTO ───────────────────────────────────────────────────────────
  { key: 'cto:health-check',         label: 'CTO 헬스체크',       botType: 'CTO',          action: 'HEALTH_CHECK',           schedule: '매 4시간',             type: 'GHA',      workflow: 'agents-hourly' },
  { key: 'cto:error-monitor',        label: 'CTO 에러 모니터',    botType: 'CTO',          action: 'ERROR_MONITOR',          schedule: '매 4시간',             type: 'GHA',      workflow: 'agents-hourly' },
  { key: 'cto:security-audit',       label: 'CTO 보안 감사',      botType: 'CTO',          action: 'SECURITY_AUDIT',         schedule: '매일 06:00',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cto:crawler-health',       label: 'CTO 크롤러 헬스',    botType: 'CTO',          action: 'CRAWLER_HEALTH',         schedule: '매일 07:00',           type: 'GHA',      workflow: 'agents-daily' },

  // ─── COO ───────────────────────────────────────────────────────────
  { key: 'coo:moderator',             label: 'COO 모더레이션',    botType: 'COO', action: 'MODERATION',           schedule: '09:00, 15:00, 21:00',  type: 'GHA', workflow: 'agents-moderation' },
  { key: 'coo:content-scheduler',     label: 'COO 콘텐츠 스케줄', botType: 'COO', action: 'CONTENT_SCHEDULE',     schedule: '매일 14:00',           type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:trending-scorer',       label: 'COO 트렌딩 점수',   botType: 'COO', action: 'TRENDING_SCORE',       schedule: '12:00, 18:00',         type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:job-scraper',           label: 'COO 일자리 수집',   botType: 'COO', action: 'JOB_SCRAPE',           schedule: '12:00, 16:00, 20:00',  type: 'GHA', workflow: 'agents-jobs' },

  // ─── CDO ───────────────────────────────────────────────────────────
  { key: 'cdo:anomaly-detector',    label: 'CDO 이상 탐지',   botType: 'CDO', action: null,                 schedule: '매 4시간',    type: 'GHA', workflow: 'agents-hourly' },

  // ─── QA ────────────────────────────────────────────────────────────
  { key: 'qa:content-audit', label: 'QA 콘텐츠 감사', botType: 'QA', action: 'CONTENT_AUDIT', schedule: '매일 08:20', type: 'GHA',      workflow: 'agents-daily' },
  { key: 'qa:code-gate',     label: 'QA 코드 게이트', botType: 'QA', action: 'CODE_GATE',     schedule: '—',         type: 'DISPATCH',                   note: '/done 스킬 자동 실행' },

  // ─── COMMUNITY ─────────────────────────────────────────────────────

  // ─── CAFE CRAWLER ──────────────────────────────────────────────────

  // ─── DESIGN ────────────────────────────────────────────────────────
]

/** 팀별 그룹핑 (어드민 UI용) */
export const HANDLER_GROUPS = [
  { team: 'CEO',          emoji: '👑', keys: ['ceo:approval-reminder'] },
  { team: 'CTO',          emoji: '🔧', keys: ['cto:health-check','cto:error-monitor','cto:security-audit','cto:crawler-health'] },
  { team: 'COO',          emoji: '⚙️', keys: ['coo:moderator','coo:content-scheduler','coo:trending-scorer','coo:job-scraper'] },
  { team: 'CDO',          emoji: '📊', keys: ['cdo:anomaly-detector'] },
  { team: 'QA',           emoji: '✅', keys: ['qa:content-audit','qa:code-gate'] },
]
