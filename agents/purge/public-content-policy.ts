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
/**
 * manifest 는 후보 글이 참조하는 **전체 객체 867키**다 — 851(전용)이 아니다.
 *
 * 공유 여부는 **실행 시점**에 정해진다. 트랜잭션 안에서 새로 보호된 글이 생기면
 * 그 글의 이미지는 삭제하면 안 되는데, 계획 시점에 851 로 굳혀 두면 그 변화를 못 담는다.
 * 그래서 manifest 는 후보 전체를 담고, **삭제할지 말지는 커밋 뒤 재계산한 공유 집합**이 정한다.
 */
export const R2_MANIFEST_SHA256 = 'f9eda12fc09a840353ec47f00cccb3db34e9bd72cdb96ed435788cdf4676e710'
export const R2_MANIFEST_KEYS = 867

export const CONFIRM_TOKEN = 'PURGE-PUBLIC-CONTENT-628'

/**
 * 트랜잭션 옵션.
 *
 * `isolationLevel: 'Serializable'` 이 핵심이다. 보호 조회와 삭제가 **같은 스냅샷**에서
 * 일어나야, 조회 뒤 커밋 전에 들어온 댓글·Like·Scrap 이 무시되지 않는다.
 * 기본 격리 수준(ReadCommitted)이면 그 삽입을 못 보고 지워버린다.
 *
 * 충돌(P2034)이 나면 **재시도하지 않는다.** 되돌릴 수 없는 삭제라, 다시 시도하는 것보다
 * 멈추고 사람이 보는 편이 낫다. 롤백된 상태 = mutation 0 이다.
 *
 * 기본 5초 timeout 으로는 모자란다 — 단계별 deleteMany + 트랜잭션 내부 재조회가 있다.
 */
export const TRANSACTION_OPTIONS = {
  maxWait: 15_000,
  timeout: 180_000,
  isolationLevel: 'Serializable',
} as const

/** Prisma 직렬화 충돌. 재시도 대상이 아니라 ABORT 대상이다. */
export const SERIALIZATION_CONFLICT_CODES = ['P2034'] as const

export function isSerializationConflict(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code && (SERIALIZATION_CONFLICT_CODES as readonly string[]).includes(code)) return true
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /could not serialize|serialization failure|write conflict|deadlock detected/i.test(msg)
}

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
export interface AuthorLike { providerId: string; role: string; status?: string }

export const WITHDRAWN_PREFIX = 'withdrawn_'
export const WITHDRAWN_STATUS = 'WITHDRAWN'

export function isRealMember(a: AuthorLike | null | undefined): boolean {
  if (!a) return false
  if (a.role === 'ADMIN') return false
  const raw = a.providerId ?? ''
  if (raw.startsWith(WITHDRAWN_PREFIX)) {
    // 접두사만 보고 믿지 않는다. 실제로 탈퇴 상태인 계정이어야 익명화된 실회원이다.
    // (status 를 조회하지 않은 호출자는 undefined 를 주므로, 그때는 접두사만으로 판정한다.)
    if (a.status !== undefined && a.status !== WITHDRAWN_STATUS) return false
    return /^\d+$/.test(raw.slice(WITHDRAWN_PREFIX.length))
  }
  return /^\d+$/.test(raw)
}

/**
 * 게스트 댓글 계약.
 *
 * `guestNickname` 하나만 보면 안 된다. 비회원 댓글은 **닉네임과 비밀번호 해시가 함께**
 * 저장된다(`prisma/schema.prisma` Comment). 닉네임만 있는 행은 그 계약을 만족하지 않으므로
 * 사람 흔적으로 세지 않는다.
 */
export interface GuestCommentLike {
  authorId: string | null
  guestNickname: string | null
  guestPasswordHash: string | null
}

export function isGuestComment(c: GuestCommentLike): boolean {
  return c.authorId === null && c.guestNickname !== null && c.guestPasswordHash !== null
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
 * 보호 신호는 **여섯 축**이다. 하나라도 켜지면 그 글은 최종 집합에서 빠진다.
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
  /** 🔴 봇 댓글에 실회원이 누른 공감. `Like.postId` 는 null 이라 글 조회로는 안 잡힌다. */
  hasRealCommentLike: boolean
  hasRealScrap: boolean
}

export const PROTECTION_AXES = [
  'hasRealAuthor', 'hasRealComment', 'hasGuestComment',
  'hasRealLike', 'hasRealCommentLike', 'hasRealScrap',
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
  /** 🔴 **실제로 지운 ID** 중 남아 있는 수. 보호된 글은 여기 들어가면 안 된다. */
  deletedRemaining: number
  /** 트랜잭션이 지웠다고 보고한 수 */
  deletedCount: number
  preserveBefore: number
  preserveAfter: number
  /** 보호돼 제외된 글 수(preflight + 트랜잭션) */
  protectedExpected: number
  /** 그 글들이 지금도 살아 있는 수. 보호했으면 전건 그대로여야 한다. */
  protectedRemaining: number
  /** 8종 전부. BLOCK·CLEANUP 은 0이어야 하고 PRESERVE 는 남아 있어야 정상이다. */
  semanticResidual: readonly SemanticCount[]
  /**
   * 🔴 **삭제한 글 기준** 자식 행 잔량. 전부 0이어야 한다.
   *
   * 이전 계약(`before=후보 전체` − `after=deletedIds`)은 집합이 달라서,
   * 보호 제외가 한 건이라도 생기면 그 글의 자식 행이 "안 지워진 것"으로 잡혀
   * 멀쩡한 실행이 실패했다. 보호된 글의 자식은 **남아 있는 게 맞다.**
   * 그래서 차분이 아니라 **삭제한 ID 기준 잔량 0** 으로 본다.
   */
  childResidual: readonly { table: string; remaining: number }[]
}

/**
 * `done` 을 말해도 되는지 판정한다.
 * 하나라도 어긋나면 성공이라고 하지 않는다 — 이 도구의 마지막 안전선이다.
 *
 * 🔴 보호 제외가 생긴 실행도 **정상 성공**이다. 그때 삭제 대상은 628 보다 적고,
 *    남아 있는 글이 있는 게 맞다. 그래서 "후보가 남았는가"가 아니라
 *    **"실제로 지운 ID 가 남았는가"** 를 본다.
 */
export function verifyAfterPurge(i: PostCheckInput): PlanIssue[] {
  const out: PlanIssue[] = []
  if (i.deletedRemaining !== 0) {
    out.push({ code: 'TARGET_REMAINS', detail: `삭제한 글 ${i.deletedRemaining}건이 아직 있다` })
  }
  if (i.deletedCount <= 0) {
    out.push({ code: 'NOTHING_DELETED', detail: '삭제 건수가 0이다' })
  }
  if (i.preserveAfter !== i.preserveBefore) {
    out.push({ code: 'PRESERVE_CHANGED', detail: `보존 ${i.preserveBefore} → ${i.preserveAfter}` })
  }
  if (i.protectedRemaining !== i.protectedExpected) {
    out.push({ code: 'PROTECTED_LOST', detail: `보호 제외 글 ${i.protectedExpected} → ${i.protectedRemaining}` })
  }
  // 8종 전부 확인 — 빠진 축이 있으면 그것부터 잡는다.
  const seen = new Set(i.semanticResidual.map((c) => `${c.model}.${c.field}`))
  for (const r of SEMANTIC_REFS) {
    if (!seen.has(`${r.model}.${r.field}`)) {
      out.push({ code: 'SEMANTIC_NOT_CHECKED', detail: `${r.model}.${r.field} 를 사후에 확인하지 않았다` })
    }
  }
  out.push(...residualSemanticIssues(i.semanticResidual))
  for (const t of i.childResidual) {
    if (t.remaining !== 0) {
      out.push({ code: 'CHILD_ROWS_REMAIN', detail: `${t.table} 에 ${t.remaining}행 남음 (삭제한 글 기준)` })
    }
  }
  return out
}

// ── 완료 상태 ─────────────────────────────────────────────────
/**
 * 이 작업은 **DB 와 R2 두 개**로 끝난다. 둘을 한 단어로 뭉치면
 * 이미지가 남았는데 done 이라고 말하게 된다.
 */
export type CompletionState =
  | 'DRY_RUN'
  | 'DB_COMPLETE_R2_PENDING'
  | 'DB_COMPLETE'
  | 'R2_COMPLETE'
  | 'FULLY_COMPLETE'

export interface R2Outcome {
  /** 자격증명이 없어 아예 시도하지 못했는가 */
  skippedNoCredentials: boolean
  uncertain: number
  remaining: number
}

export function classifyCompletion(dbDone: boolean, r2: R2Outcome | null): CompletionState {
  if (!dbDone && r2 === null) return 'DRY_RUN'
  const r2Done = r2 !== null && !r2.skippedNoCredentials && r2.uncertain === 0 && r2.remaining === 0
  if (!dbDone) return r2Done ? 'R2_COMPLETE' : 'DB_COMPLETE_R2_PENDING'
  if (r2Done) return 'FULLY_COMPLETE'
  return 'DB_COMPLETE_R2_PENDING'
}

/** 종료 코드. 호출자가 `--r2-only` 로 재개할지 판단하는 근거다. */
export const EXIT_CODE: Record<CompletionState, number> = {
  DRY_RUN: 0,
  FULLY_COMPLETE: 0,
  R2_COMPLETE: 0,
  DB_COMPLETE: 0,
  /** 실패는 아니지만 **끝난 것도 아니다.** 0 으로 끝내면 아무도 이어서 돌리지 않는다. */
  DB_COMPLETE_R2_PENDING: 3,
}

/**
 * `--r2-only` 를 허용해도 되는가.
 *
 * DB 가 아직 시작 전인데 이미지만 지우면 **살아 있는 글의 이미지가 깨진다.**
 * DB 가 끝났거나, 남은 후보가 전부 지금 보호 대상일 때만 허용한다.
 */
export function canRunR2Only(
  state: RunState,
  remainingCandidates: number,
  protectedAmongRemaining: number,
): { allowed: boolean; reason: string } {
  if (state === 'COMPLETE') return { allowed: true, reason: 'DB 가 이미 COMPLETE 다' }
  if (state === 'NOT_STARTED') {
    if (remainingCandidates > 0 && remainingCandidates === protectedAmongRemaining) {
      return { allowed: true, reason: '남은 후보가 전부 현재 보호 대상이다 — 지울 글이 없다' }
    }
    return { allowed: false, reason: 'DB 가 시작 전이다 — 살아 있는 글의 이미지를 지울 수 없다' }
  }
  if (remainingCandidates > 0 && remainingCandidates === protectedAmongRemaining) {
    return { allowed: true, reason: '남은 후보가 전부 현재 보호 대상이다' }
  }
  return { allowed: false, reason: '아직 지워야 할 후보가 남아 있다' }
}
