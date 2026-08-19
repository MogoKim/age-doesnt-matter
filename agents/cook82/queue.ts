/**
 * L2 판정/큐 레이어 — raw 후보에 gate를 적용해 큐를 갱신한다.
 *
 * 이 레이어가 하지 않는 것 (설계상 절대):
 *   - AI 호출 없음
 *   - DB write 없음
 *   - Sheet write 없음 (기본 경로에서는 Sheet를 읽지도 않는다)
 *   - 네트워크 없음 (--check-sheet 옵션을 명시할 때만 Sheet read-only 대조)
 *
 * 사람이 바꾼 상태(APPROVED/HOLD/DECLINED 등)는 재판정해도 보존한다.
 * gate를 다시 돌린다고 창업자의 승인이 지워지면 안 되기 때문이다.
 *
 * 실행:
 *   npx tsx agents/cook82/queue.ts                       # 최신 raw 파일로 큐 갱신
 *   npx tsx agents/cook82/queue.ts --raw=<path>
 *   npx tsx agents/cook82/queue.ts --check-sheet         # 기존 Sheet URL과 중복 대조(read-only)
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATE_VERSION, judge } from './gate.js'
import { DATA_DIR, ensureDataDir, QUEUE_PATH } from './paths.js'
import { decisionToStatus, toCommentSignal, type CandidateStatus, type QueueEntry, type RawCandidate } from './types.js'

/** 사람이 손댄 상태 — 재판정이 덮어쓰면 안 된다 */
const PRESERVED: readonly CandidateStatus[] = [
  'APPROVED', 'DECLINED', 'HOLD', 'SENT_TO_SHEET', 'PUBLISHED',
  'FAILED_AT_SHEET', 'HIDDEN', 'TAKEDOWN', 'EXPIRED',
]

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 12)

/** URL 정규화 — 쿼리 순서·프로토콜 차이를 흡수 */
function normalizeUrl(url: string): string {
  const num = /num=(\d+)/.exec(url)?.[1] ?? url
  return `cook82:15:${num}`
}

/** 제목 정규화 — 공백·특수문자·자모 반복 제거 */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

/** 2중 중복키 (M2-7 D절) */
export function buildDuplicateKey(sourceUrl: string, title: string): string {
  return `${sha1(normalizeUrl(sourceUrl))}:${sha1(normalizeTitle(title))}`
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T)
}

function writeJsonl<T>(path: string, rows: T[]): void {
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
}

/** data/ 에서 가장 최근 raw 파일 */
function latestRawFile(): string | null {
  if (!existsSync(DATA_DIR)) return null
  const files = readdirSync(DATA_DIR).filter((f) => f.startsWith('raw-') && f.endsWith('.jsonl')).sort()
  return files.length > 0 ? join(DATA_DIR, files[files.length - 1]) : null
}

/** raw 후보 1건 → 큐 항목. 순수 변환. */
export function toQueueEntry(raw: RawCandidate, dupKeys: Set<string>, sheetUrls: Set<string>): QueueEntry {
  const gate = judge(raw.title, raw.commentCount)
  const duplicateKey = buildDuplicateKey(raw.sourceUrl, raw.title)

  let dupSource: 'queue' | 'sheet' | null = null
  if (sheetUrls.has(raw.sourceUrl)) dupSource = 'sheet'
  else if (dupKeys.has(duplicateKey)) dupSource = 'queue'

  // 이미 Sheet에 있거나 큐에 중복이면 판정과 무관하게 검토 대상으로 내린다
  const status: CandidateStatus = dupSource ? 'REVIEW' : decisionToStatus(gate.decision)

  return {
    ...raw,
    ...gate,
    status,
    gateReason: dupSource ? `중복(${dupSource})` : gate.gateReason,
    riskFlags: dupSource ? [...gate.riskFlags, `중복:${dupSource}`] : gate.riskFlags,
    duplicateKey,
    dupSource,
    commentSignal: toCommentSignal(raw.commentCount),
    commentTone: null,
    detailFetchedAt: null,
    reviewNote: null,
    approvedBy: null,
    approvedAt: null,
    sentToSheetAt: null,
    sheetTabName: null,
    statusHistory: [
      { from: 'COLLECTED', to: status, at: new Date().toISOString(), by: `gate:${GATE_VERSION}`, reason: gate.gateReason },
    ],
  }
}

interface QueueOptions {
  rawFile: string | null
  checkSheet: boolean
}

function parseArgs(argv: string[]): QueueOptions {
  const rawArg = argv.find((a) => a.startsWith('--raw='))
  return {
    rawFile: rawArg ? rawArg.split('=')[1] : null,
    checkSheet: argv.includes('--check-sheet'),
  }
}

export async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const rawFile = opts.rawFile ?? latestRawFile()
  if (!rawFile || !existsSync(rawFile)) {
    console.log('[queue] raw 파일이 없습니다. collector를 먼저 실행하세요.')
    return
  }

  const raws = readJsonl<RawCandidate>(rawFile)
  const existing = readJsonl<QueueEntry>(QUEUE_PATH)
  const byId = new Map(existing.map((e) => [e.candidateId, e]))

  // Sheet 중복 대조는 명시적 옵션일 때만 (read-only 호출)
  let sheetUrls = new Set<string>()
  if (opts.checkSheet) {
    const { readAllSheetUrls } = await import('../community/sheets-client.js')
    sheetUrls = await readAllSheetUrls()
    console.log(`[queue] Sheet URL ${sheetUrls.size}건과 대조 (read-only)`)
  }

  const dupKeys = new Set(existing.map((e) => e.duplicateKey))
  let added = 0
  let regraded = 0
  let preserved = 0

  for (const raw of raws) {
    const prev = byId.get(raw.candidateId)
    if (!prev) {
      const entry = toQueueEntry(raw, dupKeys, sheetUrls)
      dupKeys.add(entry.duplicateKey)
      byId.set(entry.candidateId, entry)
      added++
      continue
    }
    if (PRESERVED.includes(prev.status)) {
      preserved++ // 사람이 손댄 상태는 절대 덮어쓰지 않는다
      continue
    }
    const gate = judge(raw.title, raw.commentCount)
    if (gate.gateVersion !== prev.gateVersion || gate.decision !== prev.decision) {
      const next = decisionToStatus(gate.decision)
      byId.set(raw.candidateId, {
        ...prev,
        ...gate,
        status: prev.dupSource ? 'REVIEW' : next,
        statusHistory: [
          ...prev.statusHistory,
          { from: prev.status, to: next, at: new Date().toISOString(), by: `gate:${gate.gateVersion}`, reason: '재판정' },
        ],
      })
      regraded++
    }
  }

  const rows = [...byId.values()]
  ensureDataDir()
  writeJsonl(QUEUE_PATH, rows)

  const count = (s: CandidateStatus): number => rows.filter((r) => r.status === s).length
  console.log(`[queue] raw ${raws.length}건 → 신규 ${added} · 재판정 ${regraded} · 사람상태 보존 ${preserved}`)
  console.log(`[queue] gate=${GATE_VERSION} 큐 총 ${rows.length}건`)
  console.log(`[queue]   PASS_CANDIDATE ${count('PASS_CANDIDATE')} · REVIEW ${count('REVIEW')} · REJECT ${count('REJECT')}`)
  console.log(`[queue]   APPROVED ${count('APPROVED')} · HOLD ${count('HOLD')} · SENT_TO_SHEET ${count('SENT_TO_SHEET')}`)
  console.log(`[queue] → ${QUEUE_PATH}`)
  console.log('[queue] DB write 0 · Sheet write 0 · AI 호출 0')
}

const invokedDirectly = process.argv[1]?.includes('queue')
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('[queue] 실패:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
