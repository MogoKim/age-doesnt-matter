/**
 * 공개 시드 글 3건 정합성 — **순수 판정 모듈** (I/O 없음).
 *
 * ── 무엇을 고치는가 ──────────────────────────────────────────
 *  시드 계정(`seed_NNN`)이 쓴 글이 `source=USER` · `PUBLISHED` 로 남아
 *  **회원이 쓴 글처럼 보인다.** 공개면에서 내리고 출처를 사실대로 `BOT` 으로 바꾼다.
 *
 * ── 🔴 무엇을 지우고 무엇을 지키는가 ─────────────────────────
 *  **Post 와 반응 데이터는 삭제하지 않는다. `HomeCurationOverride` 2건만 의도적으로 제거한다.**
 *  hard delete 를 하지 않는다. tombstone(제목·본문 비우기)도 **하지 않는다.**
 *  이 글들에는 **실회원 댓글 2건**이 달려 있다. 본문을 지우면 그 댓글이
 *  무엇에 대한 말이었는지 알 수 없게 된다 — 사람의 흔적을 망가뜨리는 셈이다.
 *  반응 데이터(Comment·Like·GuestLike·PostView)는 **한 행도 건드리지 않는다.**
 *
 * ── 🔴 `seed-` 가 아니라 `seed_` 다 ──────────────────────────
 *  시드 계정 접두사는 밑줄이다. `seed-*` 로 조회하면 **0건으로 오독**된다.
 *  실제로 그 오독 때문에 "시드 글 정합성 해소됨"으로 잘못 보고된 적이 있다.
 */
import { createHash } from 'node:crypto'

/** 시드 계정 `providerId` 형태. 밑줄이다 — 하이픈이 아니다. */
export const SEED_PROVIDER_ID = /^seed_\d+$/

export function isSeedAccount(providerId: string | null | undefined): boolean {
  return SEED_PROVIDER_ID.test(providerId ?? '')
}

export const CONFIRM_TOKEN = 'HIDE-SEED-PUBLIC-POSTS-3'

/**
 * 확정 manifest 전체 SHA-256.
 *
 * 대상 3건의 **identity 를 파일로 고정**한다 — Post ID · providerId · authorId 해시 ·
 * boardType · 기대 status/source · title/content 해시.
 * 파일이 한 글자라도 바뀌면 실행되지 않는다.
 */
export const MANIFEST_SHA256 = 'ce0b5769bf46c9ad6c4adc282f7bb5f1c3e47fdcb07f96f99672194fd14241bb'
export const MANIFEST_PATH = 'docs/operations/data/2026-09-14-seed-post-manifest.csv'
export const EXPECTED_PROVIDER_IDS = ['seed_001', 'seed_005', 'seed_007'] as const

/** 대상이 3건뿐이라 SEO 도구보다 짧아도 된다. 그래도 기본 5초보다는 넉넉히 둔다. */
export const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
  isolationLevel: 'Serializable',
} as const

/** 바꾸기 전 기대 상태 — 낙관적 잠금 조건이기도 하다. */
export const EXPECTED_FROM = { status: 'PUBLISHED', source: 'USER' } as const
/** 바꾼 뒤 상태. 공개면에서 내리고 출처를 사실대로 적는다. */
export const EXPECTED_TO = { status: 'HIDDEN', source: 'BOT' } as const

/**
 * 착수 전 기대 실측값. **하나라도 다르면 write 전에 멈춘다.**
 * (2026-09-14 production read-only 측정)
 */
export const EXPECTED_BASELINE = {
  seedPublishedPosts: 3,
  boardType: { STORY: 2, HUMOR: 1 } as Record<string, number>,
  comments: 9,
  realMemberComments: 2,
  postLikes: 4,
  realMemberPostLikes: 0,
  guestLikesOnComments: 1,
  postViews: 5,
  homeCurationOverrides: 2,
  postsWithR2Image: 0,
} as const

export function sha256(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex')
}
export function fingerprint(v: string): string { return sha256(v).slice(0, 10) }
export function tag(id: string): string { return `post#${fingerprint(id)}` }

export interface Issue { code: string; detail: string }

export function assertManifestIntegrity(raw: string): void {
  const actual = sha256(raw)
  if (actual !== MANIFEST_SHA256) {
    throw new Error(`[ABORT] 확정 manifest 가 변조됐다 — 기대 ${MANIFEST_SHA256.slice(0, 12)}… · 실제 ${actual.slice(0, 12)}…`)
  }
}

export interface ManifestRow {
  id: string
  providerId: string
  authorIdSha256: string
  boardType: string
  expectedStatus: string
  expectedSource: string
  titleSha256: string
  contentSha256: string
}

const MANIFEST_COLUMNS = [
  'id', 'providerId', 'authorIdSha256', 'boardType',
  'expectedStatus', 'expectedSource', 'titleSha256', 'contentSha256',
] as const

export function parseManifest(raw: string): ManifestRow[] {
  const lines = raw.trim().split('\n')
  const head = lines[0].split(',')
  const idx: Record<string, number> = {}
  for (const c of MANIFEST_COLUMNS) {
    const i = head.indexOf(c)
    if (i < 0) throw new Error(`[ABORT] manifest 에 ${c} 열이 없다`)
    idx[c] = i
  }
  return lines.slice(1).map((l) => {
    const cells = l.split(',')
    const o = {} as Record<string, string>
    for (const c of MANIFEST_COLUMNS) o[c] = cells[idx[c]]
    return o as unknown as ManifestRow
  })
}

// ── 🔴 identity 8축 재확인 ────────────────────────────────────
/** 트랜잭션 안에서 읽은 실제 상태. 해시는 호출자가 계산해 채운다. */
export interface LivePostRow {
  id: string
  authorId: string
  authorIdSha256: string
  providerId: string | null
  boardType: string
  status: string
  source: string | null
  titleSha256: string
  contentSha256: string
}

/**
 * manifest 와 라이브 상태를 **여덟 축**으로 대조한다.
 *
 * id · authorId(해시) · providerId · boardType · status · source · title(해시) · content(해시).
 * 하나라도 어긋나면 이슈를 만든다 — 호출자는 이슈가 있으면 mutation 0 으로 ABORT 한다.
 * detail 에는 원본 ID·제목·본문을 넣지 않는다.
 */
export function verifyIdentity(
  manifest: readonly ManifestRow[],
  live: readonly LivePostRow[],
): Issue[] {
  const out: Issue[] = []
  const want = new Map(manifest.map((m) => [m.id, m]))
  const got = new Map<string, LivePostRow>()

  for (const l of live) {
    if (got.has(l.id)) out.push({ code: 'IDENTITY_DUPLICATE', detail: tag(l.id) })
    got.set(l.id, l)
    if (!want.has(l.id)) out.push({ code: 'IDENTITY_EXTRA', detail: tag(l.id) })
  }

  for (const m of manifest) {
    const l = got.get(m.id)
    if (!l) { out.push({ code: 'IDENTITY_MISSING', detail: tag(m.id) }); continue }
    const axes: [string, string, string][] = [
      ['IDENTITY_AUTHOR', l.authorIdSha256, m.authorIdSha256],
      ['IDENTITY_PROVIDER', l.providerId ?? '', m.providerId],
      ['IDENTITY_BOARD_TYPE', l.boardType, m.boardType],
      ['IDENTITY_STATUS', l.status, m.expectedStatus],
      ['IDENTITY_SOURCE', l.source ?? '', m.expectedSource],
      ['IDENTITY_TITLE', l.titleSha256, m.titleSha256],
      ['IDENTITY_CONTENT', l.contentSha256, m.contentSha256],
    ]
    for (const [code, actual, expected] of axes) {
      if (actual !== expected) out.push({ code, detail: tag(m.id) })
    }
  }
  return out
}

// ── 🔴 반응 축 전수 ───────────────────────────────────────────
/**
 * 이 글들에 붙은 반응 **전부**. 착수와 사후에 같은 함수로 잰다.
 * 축이 빠지면 "안 줄었다"를 증명할 수 없다.
 */
export interface ReactionCounts {
  comments: number
  realMemberComments: number
  postLikes: number
  realMemberPostLikes: number
  commentLikes: number
  realMemberCommentLikes: number
  guestLikesOnPosts: number
  guestLikesOnComments: number
  scraps: number
  realMemberScraps: number
  postViews: number
  reports: number
}

/** 착수 기대값 (2026-09-14 production read-only 실측) */
export const EXPECTED_REACTIONS: ReactionCounts = {
  comments: 9, realMemberComments: 2,
  postLikes: 4, realMemberPostLikes: 0,
  commentLikes: 0, realMemberCommentLikes: 0,
  guestLikesOnPosts: 0, guestLikesOnComments: 1,
  scraps: 0, realMemberScraps: 0,
  postViews: 5, reports: 0,
}

/**
 * 🔴 **줄면 실패, 늘면 통과.**
 *
 * 이 작업은 반응 데이터를 지우지 않으므로 감소는 사고다.
 * 반대로 실행 중에 누가 댓글을 달거나 조회해서 **늘어나는 것은 정상**이다 —
 * 그걸 실패로 보면 사람이 서비스를 쓰는 것만으로 작업이 실패한다.
 */
export function compareReactions(before: ReactionCounts, after: ReactionCounts): Issue[] {
  const out: Issue[] = []
  for (const k of Object.keys(before) as (keyof ReactionCounts)[]) {
    if (after[k] < before[k]) {
      out.push({ code: 'REACTION_LOST', detail: `${k} ${before[k]} → ${after[k]}` })
    }
  }
  return out
}

// ── 🔴 본문 해시 사후 대조 ────────────────────────────────────
export interface ContentHashRow { id: string; titleSha256: string; contentSha256: string }

/**
 * 제목·본문이 **바뀌지 않았는지** 해시로 본다.
 *
 * "비어 있지 않다"만 보면 누가 다른 문구로 덮어써도 통과한다.
 * manifest 의 해시와 **정확히 같아야** 한다.
 */
export function verifyContentUnchanged(
  manifest: readonly ManifestRow[],
  after: readonly ContentHashRow[],
): Issue[] {
  const out: Issue[] = []
  const got = new Map(after.map((r) => [r.id, r]))
  for (const m of manifest) {
    const a = got.get(m.id)
    if (!a) { out.push({ code: 'CONTENT_MISSING', detail: tag(m.id) }); continue }
    if (a.titleSha256 !== m.titleSha256 || a.contentSha256 !== m.contentSha256) {
      out.push({ code: 'CONTENT_CHANGED', detail: tag(m.id) })
    }
  }
  return out
}

// ── 착수 조건 ────────────────────────────────────────────────
export interface Baseline {
  seedPublishedPosts: number
  boardType: Record<string, number>
  comments: number
  realMemberComments: number
  postLikes: number
  realMemberPostLikes: number
  guestLikesOnComments: number
  postViews: number
  homeCurationOverrides: number
  postsWithR2Image: number
}

/**
 * 실측이 기대와 다르면 **write 전에** 멈춘다.
 *
 * 특히 `realMemberPostLikes` 가 0 이 아니게 되거나 `postsWithR2Image` 가 늘면
 * 전제가 바뀐 것이므로 사람이 다시 봐야 한다.
 */
export function checkBaseline(actual: Baseline): Issue[] {
  const out: Issue[] = []
  const e = EXPECTED_BASELINE
  const num: [keyof Baseline, number][] = [
    ['seedPublishedPosts', e.seedPublishedPosts],
    ['comments', e.comments],
    ['realMemberComments', e.realMemberComments],
    ['postLikes', e.postLikes],
    ['realMemberPostLikes', e.realMemberPostLikes],
    ['guestLikesOnComments', e.guestLikesOnComments],
    ['postViews', e.postViews],
    ['homeCurationOverrides', e.homeCurationOverrides],
    ['postsWithR2Image', e.postsWithR2Image],
  ]
  for (const [k, want] of num) {
    const got = actual[k] as number
    if (got !== want) out.push({ code: 'BASELINE_MISMATCH', detail: `${k} 기대 ${want} · 실제 ${got}` })
  }
  const wantBt = JSON.stringify(e.boardType)
  const gotBt = JSON.stringify(
    Object.fromEntries(Object.keys(e.boardType).map((k) => [k, actual.boardType[k] ?? 0])),
  )
  if (wantBt !== gotBt) out.push({ code: 'BASELINE_BOARD_TYPE', detail: `기대 ${wantBt} · 실제 ${gotBt}` })
  if (Object.keys(actual.boardType).some((k) => !(k in e.boardType))) {
    out.push({ code: 'BASELINE_BOARD_TYPE', detail: `기대 밖 boardType: ${Object.keys(actual.boardType).join(',')}` })
  }
  return out
}

// ── 대상 판정 ────────────────────────────────────────────────
export interface SeedPostRow {
  id: string
  boardType: string
  status: string
  source: string | null
  providerId: string | null
}

export interface TargetPlan { targets: string[]; issues: Issue[] }

/**
 * 바꿀 글을 고른다.
 *
 * 시드 계정이 쓴 `PUBLISHED` + `source=USER` 글만이다.
 * 하나라도 조건을 벗어나면 **그 행만 빼는 게 아니라 전체를 ABORT** 한다 —
 * 3건짜리 작업에서 조건이 어긋났다는 건 전제가 바뀌었다는 뜻이다.
 */
export function planTargets(rows: readonly SeedPostRow[]): TargetPlan {
  const issues: Issue[] = []
  const targets: string[] = []
  const seen = new Set<string>()

  for (const r of rows) {
    if (seen.has(r.id)) { issues.push({ code: 'DUPLICATE', detail: tag(r.id) }); continue }
    seen.add(r.id)
    if (!isSeedAccount(r.providerId)) {
      issues.push({ code: 'NOT_SEED_AUTHOR', detail: tag(r.id) })
      continue
    }
    if (r.status !== EXPECTED_FROM.status) {
      issues.push({ code: 'UNEXPECTED_STATUS', detail: `${tag(r.id)} · ${r.status}` })
      continue
    }
    if ((r.source ?? '') !== EXPECTED_FROM.source) {
      issues.push({ code: 'UNEXPECTED_SOURCE', detail: `${tag(r.id)} · ${r.source}` })
      continue
    }
    targets.push(r.id)
  }

  if (targets.length !== EXPECTED_BASELINE.seedPublishedPosts) {
    issues.push({
      code: 'TARGET_COUNT',
      detail: `기대 ${EXPECTED_BASELINE.seedPublishedPosts} · 실제 ${targets.length}`,
    })
  }
  return { targets, issues }
}

// ── 사후 검증 ────────────────────────────────────────────────
export interface AfterCheck {
  seedPublishedRemaining: number
  seedHiddenBot: number
  totalPosts: number
  publishedTotal: number
  hiddenTotal: number
  comments: number
  realMemberComments: number
  postLikes: number
  guestLikesOnComments: number
  postViews: number
  homeCurationOverrides: number
  /** 제목·본문을 지우지 않았는지 — tombstone 금지 계약 */
  postsWithEmptyTitleOrContent: number
}

export const EXPECTED_AFTER = {
  seedPublishedRemaining: 0,
  seedHiddenBot: 3,
  totalPosts: 3968,
  publishedTotal: 216,
  hiddenTotal: 3545,
  homeCurationOverrides: 0,
} as const

/**
 * `done` 을 말해도 되는지 판정한다.
 *
 * 반응 데이터는 **전후 동일**해야 한다. 하나라도 줄었으면 실패다 —
 * 이 작업은 아무것도 지우지 않기로 한 작업이기 때문이다.
 */
export function verifyAfter(a: AfterCheck, before: Baseline): Issue[] {
  const out: Issue[] = []
  const e = EXPECTED_AFTER

  if (a.seedPublishedRemaining !== e.seedPublishedRemaining) {
    out.push({ code: 'STILL_PUBLISHED', detail: `공개 시드 글 ${a.seedPublishedRemaining}건 남음` })
  }
  if (a.seedHiddenBot !== e.seedHiddenBot) {
    out.push({ code: 'HIDDEN_BOT_COUNT', detail: `HIDDEN/BOT 기대 ${e.seedHiddenBot} · 실제 ${a.seedHiddenBot}` })
  }
  if (a.totalPosts !== e.totalPosts) {
    out.push({ code: 'TOTAL_POSTS_CHANGED', detail: `전체 Post 기대 ${e.totalPosts} · 실제 ${a.totalPosts}` })
  }
  if (a.publishedTotal !== e.publishedTotal) {
    out.push({ code: 'PUBLISHED_TOTAL', detail: `PUBLISHED 기대 ${e.publishedTotal} · 실제 ${a.publishedTotal}` })
  }
  if (a.hiddenTotal !== e.hiddenTotal) {
    out.push({ code: 'HIDDEN_TOTAL', detail: `HIDDEN 기대 ${e.hiddenTotal} · 실제 ${a.hiddenTotal}` })
  }
  if (a.homeCurationOverrides !== e.homeCurationOverrides) {
    out.push({ code: 'CURATION_REMAINS', detail: `HomeCurationOverride ${a.homeCurationOverrides}건 남음` })
  }

  // 반응 데이터 — 전후 동일해야 한다
  const same: [string, number, number][] = [
    ['Comment', before.comments, a.comments],
    ['실회원 Comment', before.realMemberComments, a.realMemberComments],
    ['Like(post)', before.postLikes, a.postLikes],
    ['GuestLike(comment)', before.guestLikesOnComments, a.guestLikesOnComments],
    ['PostView', before.postViews, a.postViews],
  ]
  for (const [label, b, aft] of same) {
    if (b !== aft) out.push({ code: 'REACTION_DATA_CHANGED', detail: `${label} ${b} → ${aft}` })
  }

  if (a.postsWithEmptyTitleOrContent !== 0) {
    out.push({
      code: 'TOMBSTONED',
      detail: `제목·본문이 비워진 글 ${a.postsWithEmptyTitleOrContent}건 — tombstone 은 하지 않기로 했다`,
    })
  }
  return out
}
