// 운영 원장(ledger) — 작업 누락 방지용 최소 모델. PR-1 Beta.
//
// 기존 probe 카드(cards.ts)와 **완전히 분리**된다.
//   - probe 카드: "지금 상태가 어떤가"를 git/CI/HTTP로 자동 판정 (썩지 않음)
//   - 운영 원장: "이 일이 끝났는가"를 사람이 기록 (probe로는 알 수 없는 것)
//
// 핵심 원칙 (창업자 확정):
//   merge는 종결이 아니다. production 배포도 종결이 아니다. **운영검증 PASS만 종결이다.**
//   dry-run은 종료조건(close_condition)과 due가 없으면 위험 상태다.
//
// ProbeStatus 계약(boolean|null)과 evaluator 판정 로직은 건드리지 않는다.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** merge·deploy는 중간 상태다. verified_closed만 종결. */
export type LedgerStatus =
  | 'planned'
  | 'investigating'
  | 'in_progress'
  | 'pr_open'
  | 'merged_waiting_deploy'          // merge됨 — 아직 운영 반영 전
  | 'deployed_waiting_verification'  // 배포됨 — 아직 검증 전
  | 'verified_closed'                // ★ 유일한 종결
  | 'blocked'
  | 'known_issue'
  | 'dryrun_followup_required'       // 종료조건 없으면 위험

/** 세션 이름이 아니라 workstream 기준 (세션은 매번 바뀌므로) */
export type OwnerSession =
  | 'codex-master' | 'claude-curator' | 'claude-ui' | 'claude-ops' | 'founder' | 'unassigned'

export interface LedgerItem {
  id: string
  title: string
  status: LedgerStatus
  owner_session: OwnerSession
  priority: 'P0' | 'P1' | 'P2'
  next_action: string
  close_condition: string
  category?: string
  trigger?: string | null
  due?: string | null
  pass_criteria?: string
  verification_required?: boolean
  last_verified_at?: string | null
  related_pr?: number[]
  risk?: 'low' | 'mid' | 'high'
  known_issue_type?: 'accepted' | 'deferred' | 'needs_decision' | null
  do_not_touch?: string[]
  note?: string
}

/** 화면 4분류 — 창업자가 항상 요구하는 형태 */
export type LedgerColumn =
  | '배포완료-적용확인만'
  | '지금가능'
  | '백로그'
  | '절대누락금지'

export interface LedgerIssue {
  level: 'error' | 'warn'
  message: string
}

export interface EvaluatedItem {
  item: LedgerItem
  column: LedgerColumn
  issues: LedgerIssue[]
  overdue: boolean
}

const REQUIRED_FIELDS: (keyof LedgerItem)[] = [
  'id', 'title', 'status', 'owner_session', 'priority', 'next_action', 'close_condition',
]

/** trigger/due 중 하나가 반드시 있어야 하는 상태 */
const NEEDS_WHEN: LedgerStatus[] = [
  'merged_waiting_deploy', 'deployed_waiting_verification', 'dryrun_followup_required',
]

function parseWhen(v: string | null | undefined): number | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** 필수 필드·조건부 필수·기한 경과를 검사한다. 화면에 그대로 표시된다. */
export function validateItem(item: LedgerItem, now = Date.now()): { issues: LedgerIssue[]; overdue: boolean } {
  const issues: LedgerIssue[] = []

  for (const f of REQUIRED_FIELDS) {
    const v = item[f]
    if (v === undefined || v === null || String(v).trim() === '') {
      issues.push({ level: 'error', message: `필수 필드 누락: ${f}` })
    }
  }

  const when = parseWhen(item.trigger) ?? parseWhen(item.due)
  if (NEEDS_WHEN.includes(item.status) && when === null) {
    issues.push({
      level: 'error',
      message: item.status === 'dryrun_followup_required'
        ? 'dry-run인데 due/trigger 없음 — 고아가 된다'
        : `${item.status}인데 trigger/due 없음`,
    })
  }

  // verification_required인데 검증 기록 없이 closed는 불가
  if (item.status === 'verified_closed' && item.verification_required && !item.last_verified_at) {
    issues.push({ level: 'error', message: 'verification_required인데 last_verified_at 없음' })
  }

  const overdue = when !== null && when < now && item.status !== 'verified_closed'
  if (overdue) issues.push({ level: 'warn', message: '기한/트리거 경과 — 확인 필요' })

  return { issues, overdue }
}

/** 상태 + 문제 유무로 4분류 배치. 문제가 있으면 무조건 '절대누락금지'로 올린다. */
export function columnOf(item: LedgerItem, issues: LedgerIssue[], overdue: boolean): LedgerColumn {
  if (issues.some(i => i.level === 'error') || overdue) return '절대누락금지'
  if (item.status === 'dryrun_followup_required') return '절대누락금지'
  if (item.status === 'merged_waiting_deploy' || item.status === 'deployed_waiting_verification') {
    return '배포완료-적용확인만'
  }
  if (item.status === 'in_progress' || item.status === 'investigating' || item.status === 'pr_open') {
    return '지금가능'
  }
  // planned 중 담당자가 정해졌고 트리거가 아직 없는 것 = 지금 착수 가능
  if (item.status === 'planned' && item.owner_session !== 'unassigned' && !item.trigger) {
    return '지금가능'
  }
  return '백로그'
}

export interface LedgerState {
  updated: string
  items: EvaluatedItem[]
  counts: Record<LedgerColumn, number>
  errorCount: number
}

/** ledger.json을 읽어 평가한다. 파일이 없거나 깨져도 보드 전체를 죽이지 않는다. */
export function loadLedger(now = Date.now()): LedgerState {
  const empty: LedgerState = {
    updated: '',
    items: [],
    counts: { '배포완료-적용확인만': 0, '지금가능': 0, '백로그': 0, '절대누락금지': 0 },
    errorCount: 0,
  }
  let raw: string
  try {
    raw = readFileSync(join(HERE, 'ledger.json'), 'utf-8')
  } catch {
    return empty
  }
  let parsed: { _updated?: string; items?: LedgerItem[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...empty, updated: 'PARSE_ERROR' }
  }

  const evaluated: EvaluatedItem[] = (parsed.items ?? []).map((item) => {
    const { issues, overdue } = validateItem(item, now)
    return { item, column: columnOf(item, issues, overdue), issues, overdue }
  })

  const counts = { ...empty.counts }
  for (const e of evaluated) counts[e.column]++

  return {
    updated: parsed._updated ?? '',
    items: evaluated,
    counts,
    errorCount: evaluated.filter(e => e.issues.some(i => i.level === 'error')).length,
  }
}
