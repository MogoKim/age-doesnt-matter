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
  // 후보당 2줄로 압축한다. 15건이 한 화면(30줄)에 들어와야 훑을 수 있다.
  // 번호는 이 출력 안에서만 유효한 표기다 — 상태 변경은 candidateId로만 한다.
  rows.slice(0, limit).forEach((r, i) => {
    const et = r.entertainmentType ? ' 🎬' : ''
    const flags = r.riskFlags.length > 0 ? `  ⚠️ ${r.riskFlags.join(',')}` : ''
    const num = r.candidateId.split(':')[2] ?? ''
    console.log(
      `  ${String(i + 1).padStart(2)}. 💬${String(r.commentCount).padStart(2)} ns${r.nsScore} ff${r.ffScore} ` +
        `${r.suggestedBoard.padEnd(9)}${et} ${r.title.slice(0, 44)}${flags}`,
    )
    console.log(`      ${r.candidateId}  https://www.82cook.com/entiz/read.php?bn=15&num=${num}`)
  })
  if (rows.length > limit) console.log(`  … 외 ${rows.length - limit}건`)
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
    const raw = arg(flag)
    if (!raw) continue

    // 다중 지정: --approve=id1,id2,id3
    // ★ all-or-nothing — 하나라도 문제가 있으면 전부 적용하지 않는다.
    //   부분 적용되면 "어디까지 됐지?"를 되짚어야 하고, 승인은 되돌리기 어려운 동작이다.
    const ids = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    const targets: number[] = []
    const problems: string[] = []

    for (const id of ids) {
      const idx = rows.findIndex((r) => r.candidateId === id)
      if (idx < 0) {
        problems.push(`${id} — 큐에 없음`)
        continue
      }
      if (rows[idx].status === 'REJECT') {
        problems.push(`${id} — REJECT 후보(${rows[idx].gateReason})는 승인할 수 없음`)
        continue
      }
      if (targets.includes(idx)) continue // 같은 id 중복 지정은 무시
      targets.push(idx)
    }

    if (problems.length > 0) {
      console.log(`[review] 중단: ${problems.length}건에 문제가 있어 ${ids.length}건 전부 적용하지 않았습니다.`)
      problems.forEach((p) => console.log(`   ✗ ${p}`))
      console.log('[review] 큐는 변경되지 않았습니다. 문제 항목을 빼고 다시 실행하세요.')
      process.exitCode = 1
      return
    }

    for (const idx of targets) {
      const before = rows[idx]
      rows[idx] = transition(before, to, note)
      console.log(`[review] ${before.candidateId} : ${before.status} → ${to}`)
      console.log(`[review]   ${before.title.slice(0, 60)}`)
    }
    saveQueue(rows)
    console.log(`[review] ${targets.length}건 적용. Sheet write 0 · DB write 0 (큐 파일만 갱신)`)
    return
  }

  // 조회 모드 — 위 for 문에서 어떤 액션 인자도 걸리지 않았을 때만 도달한다
  const status = (arg('status') ?? 'PASS_CANDIDATE') as CandidateStatus
  const limit = Number(arg('limit') ?? '15')
  const filtered = rows
    .filter((r) => r.status === status)
    .sort((a, b) => SIGNAL_RANK[b.commentSignal] - SIGNAL_RANK[a.commentSignal] || b.nsScore - a.nsScore)

  const count = (s: CandidateStatus): number => rows.filter((r) => r.status === s).length
  console.log(`[review] 큐 ${rows.length}건 — PASS ${count('PASS_CANDIDATE')} · REVIEW ${count('REVIEW')} · REJECT ${count('REJECT')} · APPROVED ${count('APPROVED')} · HOLD ${count('HOLD')}`)
  console.log(`\n## ${status} (${filtered.length}건, 댓글 신호순)`)
  printRows(filtered, limit)
  console.log('\n승인:  npx tsx agents/cook82/review.ts --approve=<id>[,<id>,...]')
  console.log('보류:  npx tsx agents/cook82/review.ts --hold=<id>[,<id>,...]')
  console.log('반려:  npx tsx agents/cook82/review.ts --decline=<id>[,<id>,...]')
  console.log('       (여러 건은 쉼표로. 하나라도 문제가 있으면 전부 적용하지 않습니다)')
}

const invokedDirectly = process.argv[1]?.includes('review')
if (invokedDirectly) main()
