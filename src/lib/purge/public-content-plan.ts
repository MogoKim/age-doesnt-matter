/**
 * 공개 콘텐츠 628건 영구 삭제 — **순수** 계획·검증 로직.
 *
 * 여기에는 DB·네트워크·파일시스템이 없다. CSV 텍스트와 라이브 스냅샷을 받아
 * "지워도 되는가"를 판정할 뿐이다. 그래야 실패 경로를 테스트로 재현할 수 있다.
 *
 * ── 판정 원칙 ────────────────────────────────────────────────
 *  fail-closed. 하나라도 어긋나면 **mutation 0 상태에서 ABORT** 한다.
 *  행별로 건너뛰지(SKIP) 않는다 — 부분 삭제는 되돌릴 수 없다.
 *
 * ── 되돌릴 수 없다 ───────────────────────────────────────────
 *  이 도구에는 롤백이 없다. hard delete 는 복구 경로가 없기 때문이다.
 *  그래서 사전 검사가 SEO 도구보다 두껍다.
 */
import { createHash } from 'node:crypto'

/** 확정 CSV 전체 SHA-256. 파일이 한 글자라도 바뀌면 실행되지 않는다. */
export const CSV_SHA256 = '35f1130ecfdca6e3a4b34bc8fbe0f066b977a5f24026622c735344e153cde70d'

export const CONFIRM_TOKEN = 'PURGE-PUBLIC-CONTENT-628'

/** 50회를 훌쩍 넘는 단계별 deleteMany 다. Prisma 기본 5초로는 모자란다. */
export const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 180_000 } as const

export const EXPECTED_TOTAL = 628
export const EXPECTED_STATUS = 'PUBLISHED' as const

/** 역사적 출처별 기대 건수. 합계가 628 이 아니면 CSV 가 잘못된 것이다. */
export const EXPECTED_ORIGIN_COUNTS: Record<string, number> = {
  HIDE: 60,
  PRESERVE_CANDIDATE: 247,
  KEEP_NOINDEX: 153,
  MANUAL_REVIEW: 159,
  BRAND_COPY_HOLD_REVIEW: 4,
  OFFICIAL_NAME_ONLY_REVIEW: 3,
  BRAND_COPY_PARTIAL_HOLD_REVIEW: 1,
  SOURCE_TITLE_ONLY_REVIEW: 1,
}

/**
 * 보존 경계. 이 집합과 삭제 후보가 한 건이라도 겹치면 ABORT 한다.
 * 수치는 확정 문서 기준이며, CSV 대조로 실행 때마다 다시 센다.
 */
export const EXPECTED_PRESERVE_TOTAL = 218

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** 로그에 원본 ID 를 남기지 않기 위한 지문. */
export function fingerprint(value: string): string {
  return sha256(value).slice(0, 10)
}

/** 이슈 상세에 쓰는 표기 — 원본 ID 는 절대 넣지 않는다. */
export function tag(id: string): string {
  return `post#${fingerprint(id)}`
}

export function assertCsvIntegrity(raw: string): void {
  const actual = sha256(raw)
  if (actual !== CSV_SHA256) {
    throw new Error(
      `[ABORT] 확정 CSV 가 변조됐다 — 기대 ${CSV_SHA256.slice(0, 12)}… · 실제 ${actual.slice(0, 12)}…`,
    )
  }
}

// ── CSV ──────────────────────────────────────────────────────
/** RFC 4180 상태기계. 따옴표 안의 쉼표·개행을 필드 구분자로 보지 않는다. */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (quoted) {
      if (c === '"') {
        if (raw[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',') { row.push(cur); cur = ''; continue }
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue }
    if (c === '\r') continue
    cur += c
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

export interface PurgeRow {
  id: string
  originTier: string
  originAction: string
  boardType: string
  source: string
  expectedStatus: string
  titleSha256_12: string
  publishedAt: string
}

export function toPurgeRows(table: string[][]): PurgeRow[] {
  const [head, ...body] = table
  const idx = (name: string) => {
    const i = head.indexOf(name)
    if (i < 0) throw new Error(`[ABORT] CSV 에 ${name} 열이 없다`)
    return i
  }
  const cols = {
    id: idx('id'), originTier: idx('originTier'), originAction: idx('originAction'),
    boardType: idx('boardType'), source: idx('source'), expectedStatus: idx('expectedStatus'),
    titleSha256_12: idx('titleSha256_12'), publishedAt: idx('publishedAt'),
  }
  return body.map((r) => ({
    id: r[cols.id], originTier: r[cols.originTier], originAction: r[cols.originAction],
    boardType: r[cols.boardType], source: r[cols.source], expectedStatus: r[cols.expectedStatus],
    titleSha256_12: r[cols.titleSha256_12], publishedAt: r[cols.publishedAt],
  }))
}

export interface PlanIssue { code: string; detail: string }

export interface PurgePlan {
  targets: PurgeRow[]
  issues: PlanIssue[]
}

/**
 * CSV 자체의 정합성만 본다(라이브 대조는 `detectDrift`).
 * `preserveIds` 를 주면 보존 경계와의 교집합까지 본다.
 */
export function buildPlan(rows: PurgeRow[], preserveIds: readonly string[] = []): PurgePlan {
  const issues: PlanIssue[] = []

  if (rows.length !== EXPECTED_TOTAL) {
    issues.push({ code: 'ROW_COUNT', detail: `기대 ${EXPECTED_TOTAL} · 실제 ${rows.length}` })
  }

  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.id) { issues.push({ code: 'EMPTY_ID', detail: '빈 id 행이 있다' }); continue }
    if (seen.has(r.id)) issues.push({ code: 'DUPLICATE_ID', detail: tag(r.id) })
    seen.add(r.id)
    if (r.expectedStatus !== EXPECTED_STATUS) {
      issues.push({ code: 'NOT_PUBLISHED_IN_CSV', detail: `${tag(r.id)} · ${r.expectedStatus}` })
    }
    if (!EXPECTED_ORIGIN_COUNTS[r.originAction]) {
      issues.push({ code: 'UNKNOWN_ORIGIN_ACTION', detail: `${tag(r.id)} · ${r.originAction}` })
    }
  }

  const byAction: Record<string, number> = {}
  for (const r of rows) byAction[r.originAction] = (byAction[r.originAction] ?? 0) + 1
  for (const [action, expected] of Object.entries(EXPECTED_ORIGIN_COUNTS)) {
    const actual = byAction[action] ?? 0
    if (actual !== expected) {
      issues.push({ code: 'ORIGIN_COUNT', detail: `${action} 기대 ${expected} · 실제 ${actual}` })
    }
  }

  const preserve = new Set(preserveIds)
  for (const r of rows) {
    if (preserve.has(r.id)) issues.push({ code: 'PRESERVE_OVERLAP', detail: tag(r.id) })
  }
  if (preserveIds.length > 0 && preserve.size !== EXPECTED_PRESERVE_TOTAL) {
    issues.push({
      code: 'PRESERVE_COUNT',
      detail: `보존 경계 기대 ${EXPECTED_PRESERVE_TOTAL} · 실제 ${preserve.size}`,
    })
  }

  return { targets: rows, issues }
}

// ── 라이브 대조 ───────────────────────────────────────────────
export interface LiveRow {
  id: string
  boardType: string
  status: string
  titleSha256_12: string
  /** 실회원(카카오 숫자 providerId · 비ADMIN)이 쓴 글인가 */
  hasRealAuthor: boolean
  /** 실회원이 단 댓글이 있는가 */
  hasRealComment: boolean
  /** Turnstile 통과 게스트 댓글이 있는가 */
  hasGuestComment: boolean
}

/**
 * 실행 직전 재검사.
 *
 * 🔴 보호 신호(`hasRealAuthor`·`hasRealComment`·`hasGuestComment`)는
 *    **ABORT 가 아니라 자동 제외**다 — 창업자 지시가 그렇다.
 *    나머지 불일치는 전부 ABORT 한다.
 */
export interface DriftResult {
  issues: PlanIssue[]
  /** 보호 신호가 새로 생겨 이번 실행에서 빠지는 ID */
  protectedExclusions: string[]
  /** 실제로 지울 ID */
  deletable: string[]
}

export function detectDrift(targets: readonly PurgeRow[], live: readonly LiveRow[]): DriftResult {
  const issues: PlanIssue[] = []
  const want = new Map(targets.map((t) => [t.id, t]))
  const got = new Map<string, LiveRow>()

  for (const l of live) {
    if (got.has(l.id)) issues.push({ code: 'LIVE_DUPLICATE', detail: tag(l.id) })
    got.set(l.id, l)
    if (!want.has(l.id)) issues.push({ code: 'LIVE_EXTRA', detail: tag(l.id) })
  }
  if (live.length !== targets.length) {
    issues.push({ code: 'LIVE_COUNT', detail: `기대 ${targets.length} · 응답 ${live.length}` })
  }

  const protectedExclusions: string[] = []
  const deletable: string[] = []

  for (const t of targets) {
    const l = got.get(t.id)
    if (!l) { issues.push({ code: 'MISSING', detail: tag(t.id) }); continue }
    if (l.status !== EXPECTED_STATUS) {
      issues.push({ code: 'DRIFT_STATUS', detail: `${tag(t.id)} · ${l.status}` })
      continue
    }
    if (l.boardType !== t.boardType) {
      issues.push({ code: 'DRIFT_BOARD_TYPE', detail: `${tag(t.id)} · ${l.boardType}` })
      continue
    }
    if (l.titleSha256_12 !== t.titleSha256_12) {
      issues.push({ code: 'DRIFT_TITLE', detail: tag(t.id) })
      continue
    }
    // 사람 흔적이 새로 생겼으면 그 글만 빠진다. 전체를 막지 않는다.
    if (l.hasRealAuthor || l.hasRealComment || l.hasGuestComment) {
      protectedExclusions.push(t.id)
      continue
    }
    deletable.push(t.id)
  }

  return { issues, protectedExclusions, deletable }
}

// ── COO write 권한 ────────────────────────────────────────────
/**
 * `agents/CLAUDE.md`: **DB write 는 COO 만 가능**하다.
 * 실제로 `canWrite: true` 를 선언한 것은 `agents/coo/*` 뿐이다(실측).
 * 그래서 write 경로는 COO 주체임을 밝히지 않으면 열리지 않는다.
 */
export interface WriteContext { agentId: string; canWrite: boolean }

export function assertCooWriteAuthority(ctx: WriteContext): void {
  if (!ctx.agentId.startsWith('coo:')) {
    throw new Error(`[ABORT] DB write 는 COO 경로만 가능하다 — 주체 ${ctx.agentId || '(미지정)'}`)
  }
  if (!ctx.canWrite) {
    throw new Error(`[ABORT] ${ctx.agentId} 가 canWrite=false 로 선언됐다 — write 하지 않는다`)
  }
}

// ── 재실행 판정 ───────────────────────────────────────────────
export type RunState = 'NOT_STARTED' | 'COMPLETE' | 'PARTIAL'

/**
 * 같은 명령을 두 번 돌렸을 때 안전하게 판정한다.
 * 전부 남아 있으면 시작 전, 전부 사라졌으면 완료, 섞여 있으면 PARTIAL 이다.
 * PARTIAL 은 **자동으로 이어서 지우지 않는다** — 사람이 봐야 한다.
 */
export function classifyRunState(expected: number, remaining: number): RunState {
  if (remaining === expected) return 'NOT_STARTED'
  if (remaining === 0) return 'COMPLETE'
  return 'PARTIAL'
}
