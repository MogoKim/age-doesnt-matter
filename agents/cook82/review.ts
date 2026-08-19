/**
 * 검토 CLI — 창업자가 큐를 보고 상태를 바꾼다.
 *
 * ★ APPROVED / HOLD / DECLINED 로 가는 유일한 경로다.
 *   자동 승격 코드 경로는 어디에도 없다 (M2-7 F절 "자동 PUBLISHED 금지선" 1단계).
 *
 * 어드민 UI는 일부러 만들지 않았다. 큐의 효용이 검증되기 전에는 화면을 늘리지 않는다.
 *
 * 실행:
 *   npx tsx agents/cook82/review.ts                          # PASS 후보 목록 (댓글 신호순)
 *   npx tsx agents/cook82/review.ts --status=REVIEW
 *   npx tsx agents/cook82/review.ts --approve=cook82:15:123 --note="좋은 소재"
 *   npx tsx agents/cook82/review.ts --hold=cook82:15:123
 *   npx tsx agents/cook82/review.ts --decline=cook82:15:123
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { QUEUE_PATH } from './paths.js'
import type { CandidateStatus, CommentSignal, QueueEntry } from './types.js'

const SIGNAL_RANK: Record<CommentSignal, number> = { strong: 3, mid: 2, weak: 1, none: 0 }

function loadQueue(): QueueEntry[] {
  if (!existsSync(QUEUE_PATH)) return []
  return readFileSync(QUEUE_PATH, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as QueueEntry)
}

function saveQueue(rows: QueueEntry[]): void {
  writeFileSync(QUEUE_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
}

function transition(entry: QueueEntry, to: CandidateStatus, note: string | null): QueueEntry {
  const at = new Date().toISOString()
  return {
    ...entry,
    status: to,
    reviewNote: note ?? entry.reviewNote,
    // 승인 흔적은 APPROVED/HOLD에만 남긴다 — "누가 언제 승인했나"
    approvedBy: to === 'APPROVED' || to === 'HOLD' ? 'founder' : entry.approvedBy,
    approvedAt: to === 'APPROVED' || to === 'HOLD' ? at : entry.approvedAt,
    statusHistory: [...entry.statusHistory, { from: entry.status, to, at, by: 'founder', reason: note ?? '수동 검토' }],
  }
}

function printRows(rows: QueueEntry[], limit: number): void {
  if (rows.length === 0) {
    console.log('   (해당 없음)')
    return
  }
  for (const r of rows.slice(0, limit)) {
    const et = r.entertainmentType ? ` [${r.entertainmentType}]` : ''
    const flags = r.riskFlags.length > 0 ? `  ⚠️ ${r.riskFlags.join(',')}` : ''
    console.log(
      `   ${r.candidateId.padEnd(18)} 댓글${String(r.commentCount).padStart(3)}(${r.commentSignal.padEnd(6)}) ` +
        `ns=${r.nsScore} ff=${r.ffScore} ${r.suggestedBoard.padEnd(10)}${et}`,
    )
    console.log(`   ${' '.repeat(18)} ${r.title.slice(0, 60)}${flags}`)
  }
  if (rows.length > limit) console.log(`   … 외 ${rows.length - limit}건`)
}

export function main(): void {
  const argv = process.argv.slice(2)
  const arg = (k: string): string | null => argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? null

  const rows = loadQueue()
  if (rows.length === 0) {
    console.log('[review] 큐가 비어 있습니다. collector → queue 를 먼저 실행하세요.')
    return
  }

  const note = arg('note')
  const actions: [string, CandidateStatus][] = [
    ['approve', 'APPROVED'],
    ['hold', 'HOLD'],
    ['decline', 'DECLINED'],
  ]

  for (const [flag, to] of actions) {
    const id = arg(flag)
    if (!id) continue
    const idx = rows.findIndex((r) => r.candidateId === id)
    if (idx < 0) {
      console.log(`[review] 후보를 찾을 수 없습니다: ${id}`)
      process.exitCode = 1
      return
    }
    const before = rows[idx]
    if (before.status === 'REJECT') {
      // 댓글 수나 기분으로 REJECT를 되살리지 않는다 (M2-7 E절 원칙)
      console.log(`[review] 거부: REJECT 후보는 승인할 수 없습니다 — ${before.gateReason}`)
      process.exitCode = 1
      return
    }
    rows[idx] = transition(before, to, note)
    saveQueue(rows)
    console.log(`[review] ${id} : ${before.status} → ${to}`)
    console.log(`[review]   ${before.title.slice(0, 60)}`)
    console.log('[review] Sheet write 0 · DB write 0 (큐 파일만 갱신)')
    return
  }

  // 조회 모드
  const status = (arg('status') ?? 'PASS_CANDIDATE') as CandidateStatus
  const limit = Number(arg('limit') ?? '15')
  const filtered = rows
    .filter((r) => r.status === status)
    .sort((a, b) => SIGNAL_RANK[b.commentSignal] - SIGNAL_RANK[a.commentSignal] || b.nsScore - a.nsScore)

  const count = (s: CandidateStatus): number => rows.filter((r) => r.status === s).length
  console.log(`[review] 큐 ${rows.length}건 — PASS ${count('PASS_CANDIDATE')} · REVIEW ${count('REVIEW')} · REJECT ${count('REJECT')} · APPROVED ${count('APPROVED')} · HOLD ${count('HOLD')}`)
  console.log(`\n## ${status} (${filtered.length}건, 댓글 신호순)`)
  printRows(filtered, limit)
  console.log('\n승인:  npx tsx agents/cook82/review.ts --approve=<candidateId>')
  console.log('보류:  npx tsx agents/cook82/review.ts --hold=<candidateId>')
  console.log('반려:  npx tsx agents/cook82/review.ts --decline=<candidateId>')
}

const invokedDirectly = process.argv[1]?.includes('review')
if (invokedDirectly) main()
