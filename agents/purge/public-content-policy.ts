/**
 * 공개 콘텐츠 628건 영구 삭제 — **순수 판정 모듈** (I/O 없음).
 *
 * `agents/purge/naver-origin-policy.ts` 와 같은 자리에 둔다. dry-run 과 실제 실행이
 * **같은 판정**을 쓰게 만들고, 실패 경로를 테스트로 재현할 수 있게 하기 위해서다.
 *
 * ── 되돌릴 수 없다 ───────────────────────────────────────────
 *  이 도구에는 롤백이 없다. hard delete 는 복구 경로가 없다.
 *  그래서 판정은 fail-closed 다 — 하나라도 어긋나면 mutation 0 으로 ABORT 한다.
 *
 * ── 🔴 TOCTOU ───────────────────────────────────────────────
 *  preflight 에서 "사람 흔적 없음"을 확인하고 트랜잭션을 열기까지의 틈에
 *  회원이 댓글을 달 수 있다. 그래서 보호 판정은 **트랜잭션 안에서 다시** 한다.
 *  이 파일은 그 재판정에 쓰는 순수 함수를 제공한다.
 */
import { createHash } from 'node:crypto'

/** 확정 CSV 전체 SHA-256. 한 글자라도 바뀌면 실행되지 않는다. */
export const CSV_SHA256 = 'a13e206efbe92bdd298248b71a91aa59bca97bd2b72714323fe7767df619ea73'

/** R2 실행 manifest 전체 SHA-256. */
export const R2_MANIFEST_SHA256 = '80da1a9f54f958a46998f6b59708b52a9e53e55866e6c497aed636979e8c334e'
export const R2_MANIFEST_KEYS = 851

export const CONFIRM_TOKEN = 'PURGE-PUBLIC-CONTENT-628'

/** 단계별 deleteMany + 트랜잭션 내부 재조회까지 있다. Prisma 기본 5초로는 모자란다. */
export const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 180_000 } as const

export const EXPECTED_TOTAL = 628
export const EXPECTED_STATUS = 'PUBLISHED' as const
export const EXPECTED_PRESERVE_TOTAL = 218

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

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
export function sha12(value: string): string { return sha256(value).slice(0, 12) }
/** 로그용 지문 — 원본 값을 복원할 수 없다. */
export function fingerprint(value: string): string { return sha256(value).slice(0, 10) }
export function tag(id: string): string { return `post#${fingerprint(id)}` }
/** R2 키도 로그에 쓰지 않는다. 지문만 남긴다. */
export function keyTag(key: string): string { return `obj#${fingerprint(key)}` }

export function assertCsvIntegrity(raw: string): void {
  const actual = sha256(raw)
  if (actual !== CSV_SHA256) {
    throw new Error(`[ABORT] 확정 CSV 가 변조됐다 — 기대 ${CSV_SHA256.slice(0, 12)}… · 실제 ${actual.slice(0, 12)}…`)
  }
}
export function assertR2ManifestIntegrity(raw: string): void {
  const actual = sha256(raw)
  if (actual !== R2_MANIFEST_SHA256) {
    throw new Error(`[ABORT] R2 manifest 가 변조됐다 — 기대 ${R2_MANIFEST_SHA256.slice(0, 12)}… · 실제 ${actual.slice(0, 12)}…`)
  }
}

// ── 회원 판정 ────────────────────────────────────────────────
/**
 * 실제 회원인가.
 *
 * 🔴 **탈퇴 회원도 실제 회원이다.** `cto:anonymize-withdrawn-apply` 가 30일 지난
 *    WITHDRAWN 계정의 `providerId` 를 `withdrawn_<원본>` 으로 바꾼다.
 *    숫자만 보면 익명화된 탈퇴 실회원이 봇으로 분류돼 그 사람의 글이 지워진다.
 *    봇 페르소나는 애초에 카카오 숫자 ID 가 아니므로 이 접두사를 갖지 않는다.
 */
export interface AuthorLike { providerId: string; role: string }

export const WITHDRAWN_PREFIX = 'withdrawn_'

export function isRealMember(a: AuthorLike | null | undefined): boolean {
  if (!a) return false
  if (a.role === 'ADMIN') return false
  const raw = a.providerId ?? ''
  const bare = raw.startsWith(WITHDRAWN_PREFIX) ? raw.slice(WITHDRAWN_PREFIX.length) : raw
  return /^\d+$/.test(bare)
}

// ── CSV ──────────────────────────────────────────────────────
/** RFC 4180 상태기계. 따옴표 안의 쉼표·개행을 구분자로 보지 않는다. */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (quoted) {
      if (c === '"') { if (raw[i + 1] === '"') { cur += '"'; i++ } else quoted = false } else cur += c
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
  authorIdSha256_12: string
  expectedStatus: string
  titleSha256_12: string
  contentSha256_12: string
  updatedAt: string
  publishedAt: string
}

const COLUMNS = [
  'id', 'originTier', 'originAction', 'boardType', 'source', 'authorIdSha256_12',
  'expectedStatus', 'titleSha256_12', 'contentSha256_12', 'updatedAt', 'publishedAt',
] as const

export function toPurgeRows(table: string[][]): PurgeRow[] {
  const [head, ...body] = table
  const idx: Record<string, number> = {}
  for (const c of COLUMNS) {
    const i = head.indexOf(c)
    if (i < 0) throw new Error(`[ABORT] CSV 에 ${c} 열이 없다`)
    idx[c] = i
  }
  return body.map((r) => {
    const o = {} as Record<string, string>
    for (const c of COLUMNS) o[c] = r[idx[c]]
    return o as unknown as PurgeRow
  })
}

export interface PlanIssue { code: string; detail: string }
export interface PurgePlan { targets: PurgeRow[]; issues: PlanIssue[] }

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
    if (!/^[0-9a-f]{12}$/.test(r.titleSha256_12) || !/^[0-9a-f]{12}$/.test(r.contentSha256_12)) {
      issues.push({ code: 'BAD_HASH_COLUMN', detail: tag(r.id) })
    }
    if (Number.isNaN(Date.parse(r.updatedAt))) {
      issues.push({ code: 'BAD_UPDATED_AT', detail: tag(r.id) })
    }
  }

  const byAction: Record<string, number> = {}
  for (const r of rows) byAction[r.originAction] = (byAction[r.originAction] ?? 0) + 1
  for (const [action, expected] of Object.entries(EXPECTED_ORIGIN_COUNTS)) {
    const actual = byAction[action] ?? 0
    if (actual !== expected) issues.push({ code: 'ORIGIN_COUNT', detail: `${action} 기대 ${expected} · 실제 ${actual}` })
  }

  const preserve = new Set(preserveIds)
  for (const r of rows) if (preserve.has(r.id)) issues.push({ code: 'PRESERVE_OVERLAP', detail: tag(r.id) })
  if (preserveIds.length > 0 && preserve.size !== EXPECTED_PRESERVE_TOTAL) {
    issues.push({ code: 'PRESERVE_COUNT', detail: `보존 경계 기대 ${EXPECTED_PRESERVE_TOTAL} · 실제 ${preserve.size}` })
  }
  return { targets: rows, issues }
}

// ── 라이브 대조 ───────────────────────────────────────────────
/**
 * 한 글의 라이브 상태 + 보호 신호.
 *
 * 보호 신호는 **다섯 축**이다. 하나라도 켜지면 그 글은 최종 집합에서 빠진다.
 * `PostView` 는 보호 근거가 아니고(주체 불명), 새 `GuestLike` 도 아니다(주체 판별 불가).
 * 둘 다 창업자 결정이다.
 */
export interface LiveRow {
  id: string
  boardType: string
  status: string
  source: string
  authorIdSha256_12: string
  titleSha256_12: string
  contentSha256_12: string
  updatedAt: string
  hasRealAuthor: boolean
  hasRealComment: boolean
  hasGuestComment: boolean
  hasRealLike: boolean
  hasRealScrap: boolean
}

export const PROTECTION_AXES = [
  'hasRealAuthor', 'hasRealComment', 'hasGuestComment', 'hasRealLike', 'hasRealScrap',
] as const

export function protectionReasons(l: LiveRow): string[] {
  return PROTECTION_AXES.filter((k) => l[k])
}

export interface DriftResult {
  issues: PlanIssue[]
  /** 보호 신호가 있어 이번 실행에서 빠지는 ID */
  protectedExclusions: string[]
  /** 실제로 지울 ID */
  deletable: string[]
  /**
   * 막지는 않지만 기록해 두는 관측.
   *
   * 🔴 `updatedAt` 이 여기 있는 이유(실측 2026-09-14):
   *    628건 중 3건이 CSV 생성 뒤 `updatedAt` 이 바뀌었는데
   *    **본문 drift 0 · 제목 drift 0** 이었다. 원인은 `viewCount`·`likeCount`·
   *    `trendingScore` 비정규화 갱신이다. 즉 `updatedAt` 은 글이 실제로
   *    편집됐다는 뜻이 아니다. 이걸 ABORT 축으로 두면 조회수가 오르는 것만으로
   *    도구가 영영 못 돈다. 실제 편집은 `contentSha256_12`·`titleSha256_12` 가 잡는다.
   */
  observations: PlanIssue[]
}

/**
 * 실행 직전 재검사.
 *
 * 보호 신호는 **ABORT 가 아니라 자동 제외**다(창업자 지시).
 * 나머지 불일치 — 상태·보드·출처·작성자·제목·본문·수정시각 — 는 전부 ABORT 다.
 * `boardType` 은 전체 허용목록이 아니라 **그 글의 기대값**과 맞춘다.
 */
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
  const observations: PlanIssue[] = []

  for (const t of targets) {
    const l = got.get(t.id)
    if (!l) { issues.push({ code: 'MISSING', detail: tag(t.id) }); continue }

    const mismatches: [string, string, string][] = [
      ['DRIFT_STATUS', l.status, EXPECTED_STATUS],
      ['DRIFT_BOARD_TYPE', l.boardType, t.boardType],
      ['DRIFT_SOURCE', l.source, t.source],
      ['DRIFT_AUTHOR', l.authorIdSha256_12, t.authorIdSha256_12],
      ['DRIFT_TITLE', l.titleSha256_12, t.titleSha256_12],
      ['DRIFT_CONTENT', l.contentSha256_12, t.contentSha256_12],
    ]
    const bad = mismatches.find(([, actual, expected]) => actual !== expected)
    if (bad) { issues.push({ code: bad[0], detail: tag(t.id) }); continue }

    // 여기까지 왔다는 건 제목·본문이 그대로라는 뜻이다. 그래도 기록은 남긴다.
    if (l.updatedAt !== t.updatedAt) {
      observations.push({ code: 'UPDATED_AT_CHANGED', detail: `${tag(t.id)} · 본문·제목은 동일(카운터 갱신)` })
    }

    if (protectionReasons(l).length > 0) { protectedExclusions.push(t.id); continue }
    deletable.push(t.id)
  }
  return { issues, protectedExclusions, deletable, observations }
}

// ── semantic 평문 참조 ────────────────────────────────────────
/**
 * FK 가 없는 **의미상** 참조. CASCADE 가 치워주지 않으므로 따로 판정한다.
 *
 * 정책은 셋 중 하나다.
 *   BLOCK    — 살아 있는 참조다. mutation 전에 ABORT 한다.
 *   CLEANUP  — 죽은 참조다. 같은 트랜잭션에서 지운다.
 *   PRESERVE — 역사 기록이다. 남긴다.
 */
export type SemanticPolicy = 'BLOCK' | 'CLEANUP' | 'PRESERVE'

export interface SemanticRef {
  model: string
  field: string
  policy: SemanticPolicy
  /** 왜 그렇게 정했는가 — 잔존 이유를 코드에 남긴다. */
  reason: string
}

export const SEMANTIC_REFS: readonly SemanticRef[] = [
  { model: 'VoteEvent', field: 'linkedPostId', policy: 'BLOCK',
    reason: '살아 있는 투표가 본문 글을 가리킨다 — 지우면 이벤트가 깨진다' },
  { model: 'Event', field: 'bodyPostId', policy: 'BLOCK',
    reason: '활성 이벤트의 본문 글 — 지우면 이벤트가 깨진다' },
  { model: 'User', field: 'firstGreetingPostId', policy: 'CLEANUP',
    reason: '첫인사 글 포인터. 글이 사라지면 무효 — null 로 되돌린다' },
  { model: 'NaverBlogQueue', field: 'magazinePostId', policy: 'CLEANUP',
    reason: 'naver-blog:post 는 2026-06-04 ARCHIVED — 소비자 없는 dead queue' },
  { model: 'SocialPost', field: 'sourcePostId', policy: 'CLEANUP',
    reason: '원본 글이 사라지면 출처 포인터가 무효 — null 로 되돌린다' },
  { model: 'SocialPost', field: 'linkUrl', policy: 'CLEANUP',
    reason: '삭제될 글로 가는 링크 — 404 가 되므로 null 로 되돌린다' },
  { model: 'ChannelDraft', field: 'linkUrl', policy: 'CLEANUP',
    reason: '삭제될 글로 가는 홍보 초안 링크 — 404 가 되므로 null 로 되돌린다' },
  { model: 'AdminAuditLog', field: 'targetId', policy: 'PRESERVE',
    reason: '감사 기록이다. 무엇에 무슨 조치를 했는지는 대상이 사라져도 남아야 한다' },
]

export interface SemanticCount { model: string; field: string; count: number }

/** 살아 있는 참조가 있으면 ABORT 사유를 만든다. CLEANUP·PRESERVE 는 사유가 아니다. */
export function blockingSemanticIssues(counts: readonly SemanticCount[]): PlanIssue[] {
  const policy = new Map(SEMANTIC_REFS.map((r) => [`${r.model}.${r.field}`, r]))
  const out: PlanIssue[] = []
  for (const c of counts) {
    const key = `${c.model}.${c.field}`
    const p = policy.get(key)
    if (!p) { out.push({ code: 'UNKNOWN_SEMANTIC_REF', detail: key }); continue }
    if (p.policy === 'BLOCK' && c.count > 0) {
      out.push({ code: 'ACTIVE_SEMANTIC_REF', detail: `${key} · ${c.count}건 · ${p.reason}` })
    }
  }
  return out
}

/** 사후 검증: CLEANUP 대상이 정말 0이 됐는가. PRESERVE 는 남아 있어야 정상이다. */
export function residualSemanticIssues(counts: readonly SemanticCount[]): PlanIssue[] {
  const policy = new Map(SEMANTIC_REFS.map((r) => [`${r.model}.${r.field}`, r]))
  const out: PlanIssue[] = []
  for (const c of counts) {
    const p = policy.get(`${c.model}.${c.field}`)
    if (!p) continue
    if (p.policy !== 'PRESERVE' && c.count > 0) {
      out.push({ code: 'RESIDUAL_SEMANTIC_REF', detail: `${c.model}.${c.field} · ${c.count}건 남음` })
    }
  }
  return out
}

// ── 재실행 판정 ───────────────────────────────────────────────
export type RunState = 'NOT_STARTED' | 'COMPLETE' | 'PARTIAL'

/**
 * 같은 명령을 두 번 돌렸을 때의 판정.
 *
 * `COMPLETE` 는 **끝났다는 뜻이 아니라 DB 가 끝났다는 뜻**이다.
 * R2 정리는 남아 있을 수 있으므로 호출자는 COMPLETE 에서도 이미지 단계를 이어간다.
 */
export function classifyRunState(expected: number, remaining: number): RunState {
  if (remaining === expected) return 'NOT_STARTED'
  if (remaining === 0) return 'COMPLETE'
  return 'PARTIAL'
}

// ── 사후 검증 ─────────────────────────────────────────────────
export interface PostCheckInput {
  targetsRemaining: number
  preserveBefore: number
  preserveAfter: number
  protectedExpected: number
  protectedRemaining: number
  semanticResidual: readonly SemanticCount[]
  tableDeltas: readonly { table: string; expected: number; actual: number }[]
}

/**
 * `done` 을 말해도 되는지 판정한다.
 * 하나라도 어긋나면 성공이라고 하지 않는다 — 이 도구의 마지막 안전선이다.
 */
export function verifyAfterPurge(i: PostCheckInput): PlanIssue[] {
  const out: PlanIssue[] = []
  if (i.targetsRemaining !== 0) {
    out.push({ code: 'TARGET_REMAINS', detail: `삭제 대상 ${i.targetsRemaining}건 남음` })
  }
  if (i.preserveAfter !== i.preserveBefore) {
    out.push({ code: 'PRESERVE_CHANGED', detail: `보존 ${i.preserveBefore} → ${i.preserveAfter}` })
  }
  if (i.protectedRemaining !== i.protectedExpected) {
    out.push({ code: 'PROTECTED_LOST', detail: `보호 제외 글 ${i.protectedExpected} → ${i.protectedRemaining}` })
  }
  out.push(...residualSemanticIssues(i.semanticResidual))
  for (const t of i.tableDeltas) {
    if (t.actual !== t.expected) {
      out.push({ code: 'TABLE_DELTA', detail: `${t.table} 기대 -${t.expected} · 실제 -${t.actual}` })
    }
  }
  return out
}
