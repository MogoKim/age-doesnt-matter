/**
 * L3 발행 연결 레이어 — 승인된 후보만 기존 Sheet로 넘긴다.
 *
 * ★ 이 파일이 이 시스템에서 외부에 write 하는 **유일한** 지점이다.
 *
 * 3중 안전장치 (M2-7 F절):
 *   1. 사람 게이트  — APPROVED 상태는 review CLI로만 만들 수 있다
 *   2. kill switch  — COOK82_BRIDGE_ENABLED !== 'true' 면 즉시 종료
 *   3. dry-run 기본 — `--apply` 인자가 없으면 append 호출 자체를 건너뛴다
 *                     (환경변수가 아닌 CLI 인자라서, 크론에 잘못 걸려도 실행되지 않는다)
 *
 * 기존 파일은 수정하지 않는다. sheets-client.appendRow()를 **호출만** 한다.
 * appendRow는 B열을 'PENDING'으로 고정하므로 Sheet에 HOLD가 적재될 방법이 구조적으로 없다.
 *
 * 나중에 Sheet를 걷어낼 때는 이 파일 하나만 DB 큐 write로 교체하면 된다.
 *
 * 실행:
 *   npx tsx agents/cook82/publish-bridge.ts            # dry-run (기본)
 *   npx tsx agents/cook82/publish-bridge.ts --apply    # 실제 append — 스위치 ON 필요
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { GATE_VERSION } from './gate.js'
import { BRIDGE_LOG_PATH, ensureDataDir, QUEUE_PATH } from './paths.js'
import type { QueueEntry, SuggestedBoard } from './types.js'

/**
 * ⚠️ **M2-8 7일 수동 실험 전용 임시값이다. 영구 운영 정책이 아니다.**
 *
 * 창업자 결정은 "고정 cap이 아니라 품질 우선 + guardrail 경고선"이다(M2-5).
 * 이 3건은 그 정책을 바꾼 것이 아니라, 실험 기간에만 손으로 통제 가능한 규모로 묶어둔 것이다.
 *
 * 정식 운영으로 넘어갈 때 반드시 재검토할 것:
 *   - 이 상수를 지우고 guardrail 경고선(일 발행의 40%·연예 15% 등)으로 대체할지
 *   - 아니면 상한을 유지하되 값을 올릴지
 * 실험 종료 후 이 주석이 남아 있다면, 재검토가 아직 안 된 것이다.
 */
const DAILY_LIMIT = 3

/**
 * 보드 → Sheet 탭. agents/community/sheet-board-routing.ts 의 기본 탭만 쓴다.
 * (화제성 탭은 창업자가 직접 고르는 영역이라 자동 전달 대상에서 제외)
 */
const BOARD_TO_TAB: Record<SuggestedBoard, string> = {
  STORY: '사는이야기',
  HUMOR: '웃음방',
  LIFE2: '2막준비',
  MENOPAUSE: '갱년기톡',
}

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

/**
 * guardrail (M2-7 H절). 대부분은 경고선이고, 자동 정지는 #4 하나뿐이다.
 * @returns 치명적 위반 사유. null이면 통과.
 */
export function checkGuardrails(rows: QueueEntry[]): string | null {
  const live = rows.filter((r) => r.status === 'APPROVED' || r.status === 'SENT_TO_SHEET' || r.status === 'PUBLISHED')

  // #4 제3자 범죄/의혹이 승인선을 넘으면 즉시 FAIL — 되돌릴 수 없는 유일한 위험
  const crime = live.filter((r) => r.entertainmentType === 'E5_범죄·의혹' || r.riskFlags.some((f) => f.startsWith('범죄:')))
  if (crime.length > 0) {
    return `제3자 범죄/의혹 후보가 승인선을 넘었습니다 (${crime.length}건): ${crime[0].title.slice(0, 40)}`
  }

  // #2 연예 비중 경고선
  const celeb = live.filter((r) => r.entertainmentType !== null)
  if (live.length >= 5 && celeb.length / live.length > 0.15) {
    console.log(`[bridge] ⚠️ 경고: 연예 비중 ${((celeb.length / live.length) * 100).toFixed(0)}% (경고선 15%)`)
  }

  // #7 REJECT율 이상 — gate 오작동 의심
  const judged = rows.filter((r) => ['PASS_CANDIDATE', 'REVIEW', 'REJECT'].includes(r.status))
  if (judged.length >= 20) {
    const rate = rows.filter((r) => r.status === 'REJECT').length / judged.length
    if (rate > 0.3 || rate < 0.05) {
      console.log(`[bridge] ⚠️ 경고: REJECT율 ${(rate * 100).toFixed(1)}% (정상대 5~30%) — gate 오작동 의심`)
    }
  }
  return null
}

export async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const enabled = process.env.COOK82_BRIDGE_ENABLED === 'true'

  const rows = loadQueue()
  if (rows.length === 0) {
    console.log('[bridge] 큐가 비어 있습니다.')
    return
  }

  const fatal = checkGuardrails(rows)
  if (fatal) {
    console.error(`[bridge] 🛑 정지: ${fatal}`)
    process.exitCode = 1
    return
  }

  const approved = rows.filter((r) => r.status === 'APPROVED')
  const targets = approved.slice(0, DAILY_LIMIT)

  console.log(`[bridge] APPROVED ${approved.length}건 · 이번 전달 대상 ${targets.length}건 (1일 상한 ${DAILY_LIMIT})`)
  console.log(`[bridge] mode=${apply ? 'APPLY' : 'DRY-RUN'} · killSwitch=${enabled ? 'ON' : 'OFF'}`)

  for (const t of targets) {
    const tab = BOARD_TO_TAB[t.suggestedBoard]
    const note = `cook82/${GATE_VERSION}/${t.candidateId}/${t.approvedAt ?? '-'}`
    console.log(`   → [${tab}] ${t.title.slice(0, 50)}`)
    console.log(`      ${t.sourceUrl}`)
    console.log(`      note=${note}`)
  }

  // ★ 세 조건이 모두 충족될 때만 실제 write에 도달한다
  if (!apply) {
    console.log('\n[bridge] DRY-RUN — Sheet write 0건. 실제 전달은 --apply 인자가 필요합니다.')
    return
  }
  if (!enabled) {
    console.log('\n[bridge] 중단: COOK82_BRIDGE_ENABLED=true 가 아닙니다. Sheet write 0건.')
    return
  }
  if (targets.length === 0) {
    console.log('\n[bridge] 전달 대상 없음. Sheet write 0건.')
    return
  }

  const { appendRow } = await import('../community/sheets-client.js')
  ensureDataDir()
  const updated = [...rows]

  for (const t of targets) {
    const tab = BOARD_TO_TAB[t.suggestedBoard]
    const note = `cook82/${GATE_VERSION}/${t.candidateId}/${t.approvedAt ?? '-'}`
    const at = new Date().toISOString()
    await appendRow(tab, t.sourceUrl, note)

    const idx = updated.findIndex((r) => r.candidateId === t.candidateId)
    updated[idx] = {
      ...t,
      status: 'SENT_TO_SHEET',
      sentToSheetAt: at,
      sheetTabName: tab,
      statusHistory: [...t.statusHistory, { from: 'APPROVED', to: 'SENT_TO_SHEET', at, by: 'bridge', reason: `append ${tab}` }],
    }
    appendFileSync(BRIDGE_LOG_PATH, JSON.stringify({ at, candidateId: t.candidateId, tab, sourceUrl: t.sourceUrl, gateVersion: GATE_VERSION }) + '\n', 'utf-8')
    console.log(`[bridge] ✅ Sheet 전달: ${t.candidateId} → ${tab}`)
  }

  saveQueue(updated)
  console.log(`[bridge] ${targets.length}건 전달 완료. rollback: Sheet 해당 행 B열을 'SKIP'으로 바꾸세요.`)
}

const invokedDirectly = process.argv[1]?.includes('publish-bridge')
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('[bridge] 실패:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
