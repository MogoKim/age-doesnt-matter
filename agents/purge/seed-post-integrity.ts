/**
 * 공개 시드 글 3건 정합성 — **순수 판정 모듈** (I/O 없음).
 *
 * ── 무엇을 고치는가 ──────────────────────────────────────────
 *  시드 계정(`seed_NNN`)이 쓴 글이 `source=USER` · `PUBLISHED` 로 남아
 *  **회원이 쓴 글처럼 보인다.** 공개면에서 내리고 출처를 사실대로 `BOT` 으로 바꾼다.
 *
 * ── 🔴 지우는 작업이 아니다 ──────────────────────────────────
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
