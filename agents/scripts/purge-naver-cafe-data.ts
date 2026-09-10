/**
 * 네이버 카페 유래 데이터 영구 폐기 — **일회성 도구**.
 *
 * 실행:
 *   dry-run  npx tsx --env-file=<env> agents/scripts/purge-naver-cafe-data.ts
 *   실제     npx tsx --env-file=<env> agents/scripts/purge-naver-cafe-data.ts --execute --confirm=<토큰>
 *
 * 설계
 *  - 기본 dry-run. `--execute` **와** `--confirm` 둘 다 있어야 write 한다.
 *  - 조회는 전부 **결정적 keyset pagination**(`order=id.asc` + `id=gt.<cursor>`)이고,
 *    가져온 뒤 중복·누락을 exact count 와 대조한다.
 *  - mutation 은 **추정하지 않는다**. `Prefer: return=representation` 으로 실제 영향 행을 세고,
 *    단계마다 사후 카운트를 확인한다. 하나라도 어긋나면 던진다.
 *  - **최종 검증을 통과하기 전에는 `done`/`ok:true` 를 출력하지 않는다.**
 *  - 중간에 죽어도 같은 명령으로 재개한다. 진행 상태는 **라이브 카운트에서 판정**하고
 *    ID·본문·URL 을 저장하지 않는다. checkpoint 파일에는 단계명·건수·시각만 남는다.
 *  - Prisma·raw SQL·RPC 를 쓰지 않는다. Supabase REST 와 R2 S3 API 만 쓴다.
 */
import { createHash, createHmac } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isProductionProjectRef, NAVER_ORIGIN_FILTER, isHumanProviderId, EXPECTED,
  checkStartState, checkFinalState, completedSteps, decidePost, assertNoUserPosts,
  assertMutationIsScoped, assertPageIntegrity, TOMBSTONE_PATCH, isTombstoned,
  redactForLog, STEPS, type StepName, type LiveCounts, type TraceReason, type PurgeExpectation,
} from '../purge/naver-origin-policy.js'

const BATCH = 50
const PAGE = 1000
const SIG = TOMBSTONE_PATCH.title

export type Fetcher = typeof fetch
export type R2Config = { accountId: string; accessKey: string; secretKey: string; bucket: string }
export type Ctx = { url: string; key: string; execute: boolean; fetch: Fetcher; r2?: R2Config; checkpointPath?: string; expected?: Omit<PurgeExpectation, 'publicUserPosts'> }

// ── 인자·권한 ───────────────────────────────────────────────────────────────
export function parseArgs(argv: string[]): { execute: boolean; confirm: string | null } {
  const c = argv.find((a) => a.startsWith('--confirm='))
  return { execute: argv.includes('--execute'), confirm: c ? c.slice('--confirm='.length) : null }
}
export const projectRefOf = (url: string): string => new URL(url).host.split('.')[0]
export function isExecutionAuthorized(a: { execute: boolean; confirm: string | null }, ref: string): boolean {
  return a.execute && a.confirm === `PURGE-${ref}`
}

function log(o: Record<string, unknown>): void {
  console.log(JSON.stringify(redactForLog({ at: new Date().toISOString(), ...o })))
}

// ── REST ────────────────────────────────────────────────────────────────────
const H = (c: Ctx, extra: Record<string, string> = {}) => ({ apikey: c.key, Authorization: `Bearer ${c.key}`, ...extra })

export async function count(ctx: Ctx, path: string): Promise<number> {
  const sep = path.includes('?') ? '&' : '?'
  const r = await ctx.fetch(`${ctx.url}/rest/v1/${path}${sep}select=id&limit=1`, { headers: H(ctx, { Prefer: 'count=exact' }) })
  if (!r.ok) throw new Error(`count 실패 ${r.status}`)
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1])
}

/** 결정적 keyset pagination. offset 은 쓰지 않는다 — 동시 변경 시 행이 밀려 누락된다. */
export async function selectAll<T extends { id: string }>(ctx: Ctx, table: string, select: string, filter = ''): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (;;) {
    const q = [`select=${select}`, 'order=id.asc', `limit=${PAGE}`, filter, cursor ? `id=gt.${cursor}` : ''].filter(Boolean).join('&')
    const r = await ctx.fetch(`${ctx.url}/rest/v1/${table}?${q}`, { headers: H(ctx) })
    if (!r.ok) throw new Error(`select ${table} 실패 ${r.status}`)
    const j = (await r.json()) as T[]
    if (j.length === 0) return out
    out.push(...j)
    cursor = j[j.length - 1].id
    if (j.length < PAGE) return out
  }
}

/** 무결성까지 확인하는 조회 — 중복·누락이면 던진다. */
async function selectVerified<T extends { id: string }>(ctx: Ctx, label: string, table: string, select: string, filter: string, countPath: string): Promise<T[]> {
  const rows = await selectAll<T>(ctx, table, select, filter)
  assertPageIntegrity(label, rows.map((r) => r.id), await count(ctx, countPath))
  return rows
}

/** 🔴 실제 영향 행을 돌려주는 mutation. 추정하지 않는다. */
async function mutate(ctx: Ctx, method: 'DELETE' | 'PATCH', path: string, body?: unknown): Promise<number> {
  assertMutationIsScoped(path)
  if (!ctx.execute) throw new Error('[GUARD] dry-run 에서 mutate 가 호출됐다 — 버그다.')
  const sep = path.includes('?') ? '&' : '?'
  const r = await ctx.fetch(`${ctx.url}/rest/v1/${path}${sep}select=id`, {
    method,
    headers: H(ctx, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!r.ok) throw new Error(`${method} 실패 ${r.status}`)
  const affected = (await r.json()) as unknown[]
  return Array.isArray(affected) ? affected.length : 0
}

const quoteIn = (ids: string[]) => `in.(${ids.map((i) => `"${i}"`).join(',')})`

async function deleteByIds(ctx: Ctx, step: StepName, table: string, ids: string[]): Promise<number> {
  let affected = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const n = await mutate(ctx, 'DELETE', `${table}?id=${quoteIn(chunk)}`)
    if (n !== chunk.length) {
      throw new Error(`[ABORT] ${step}/${table}: 배치 ${chunk.length}건 요청에 실제 영향 ${n}건 — 중단한다.`)
    }
    affected += n
  }
  return affected
}

// ── R2 (S3 호환 API, SigV4) ────────────────────────────────────────────────
function sigV4Headers(cfg: R2Config, method: string, key: string): Record<string, string> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = createHash('sha256').update('').digest('hex')
  const canonical = [method, `/${cfg.bucket}/${key}`, '', `host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`, '', 'host;x-amz-content-sha256;x-amz-date', payloadHash].join('\n')
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n')
  const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest()
  const signing = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), 'auto'), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signing).update(toSign).digest('hex')
  return {
    Host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
  }
}

/**
 * R2 객체 존재 판정 — **200 만 존재, 404 만 부재**다.
 *
 * 🔴 그 밖의 상태(403·429·5xx 등)를 "부재"로 세면 **지우지도 않은 객체를 지웠다고 보고**하게 된다.
 * 자격증명이 틀렸거나(403) 한도에 걸렸을(429) 때 조용히 통과하는 것이 가장 위험하다.
 * 판정할 수 없으면 **던진다.**
 */
async function r2Exists(ctx: Ctx, key: string): Promise<boolean> {
  if (!ctx.r2) throw new Error('[ABORT] R2 자격증명이 없어 객체 상태를 판정할 수 없다.')
  const url = `https://${ctx.r2.accountId}.r2.cloudflarestorage.com/${ctx.r2.bucket}/${key}`
  const r = await ctx.fetch(url, { method: 'HEAD', headers: sigV4Headers(ctx.r2, 'HEAD', key) })
  if (r.status === 200) return true
  if (r.status === 404) return false
  throw new Error(`[ABORT] R2 HEAD 응답 ${r.status} — 존재 여부를 판정할 수 없다. 중단한다.`)
}

async function r2Delete(ctx: Ctx, key: string): Promise<void> {
  if (!ctx.r2) throw new Error('[ABORT] R2 자격증명이 없다 — 객체를 지울 수 없다.')
  const url = `https://${ctx.r2.accountId}.r2.cloudflarestorage.com/${ctx.r2.bucket}/${key}`
  const r = await ctx.fetch(url, { method: 'DELETE', headers: sigV4Headers(ctx.r2, 'DELETE', key) })
  if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw new Error(`[ABORT] R2 DELETE 응답 ${r.status} — 중단한다.`)
}

// ── 대상 판정 ───────────────────────────────────────────────────────────────
export type Targets = {
  naverPostIds: string[]
  tombstoneIds: string[]
  hardDeleteIds: string[]
  botCommentIdsOnNaver: string[]
  /** P2(hard delete) 가 cascade 로 지우고 **남는** 봇 댓글 — P3 의 실제 대상이다. */
  botCommentIdsOnTombstone: string[]
  botLogIds: string[]
  r2Keys: string[]
}

type UserRow = { id: string; providerId: string | null }
type PostRow = { id: string; source: string; cafePostId: string | null; sourceUrl: string | null; title: string | null; thumbnailUrl: string | null }

const r2KeyOf = (u: string | null): string | null => { try { return u ? new URL(u).pathname.replace(/^\//, '') : null } catch { return null } }

export async function resolveTargets(ctx: Ctx): Promise<Targets> {
  const users = await selectVerified<UserRow>(ctx, 'User', 'User', 'id,providerId', '', 'User')
  const humans = new Set(users.filter((u) => isHumanProviderId(u.providerId)).map((u) => u.id))

  const posts = await selectVerified<PostRow>(
    ctx, 'Post(네이버유래)', 'Post', 'id,source,cafePostId,sourceUrl,title,thumbnailUrl',
    NAVER_ORIGIN_FILTER, `Post?${NAVER_ORIGIN_FILTER}`,
  )
  assertNoUserPosts(posts) // 🔴 fail closed

  const emb = NAVER_ORIGIN_FILTER.replace(/^or=/, 'post.or=')
  const traces = new Map<string, TraceReason[]>()
  const add = (pid: string | null, why: TraceReason) => { if (pid) traces.set(pid, [...(traces.get(pid) ?? []), why]) }

  // 🔴 아래 조회들은 **hard delete / tombstone 판정을 좌우한다.** 한 건이라도 빠지면
  //    사람 흔적이 있는 글을 통째로 지우게 된다. 전부 같은 필터의 exact count 와 대조한다.
  const comments = await selectVerified<{ id: string; postId: string; authorId: string | null }>(
    ctx, 'Comment(네이버유래)', 'Comment', 'id,postId,authorId,post:Post!inner(id)', emb,
    `Comment?select=id,post:Post!inner(id)&${emb}`,
  )
  const botCommentIdsOnNaver: string[] = []
  const botCommentsByPost = new Map<string, string[]>()
  for (const c of comments) {
    if (c.authorId == null) add(c.postId, 'comment-null')
    else if (humans.has(c.authorId)) add(c.postId, 'comment-human')
    else { botCommentIdsOnNaver.push(c.id); botCommentsByPost.set(c.postId, [...(botCommentsByPost.get(c.postId) ?? []), c.id]) }
  }
  const likes = await selectVerified<{ id: string; postId: string; userId: string }>(
    ctx, 'Like(네이버유래)', 'Like', 'id,postId,userId,post:Post!inner(id)', emb,
    `Like?select=id,post:Post!inner(id)&${emb}`,
  )
  for (const l of likes) {
    if (humans.has(l.userId)) add(l.postId, 'like-human')
  }
  for (const g of await selectVerified<{ id: string; postId: string }>(
    ctx, 'GuestLike(네이버유래)', 'GuestLike', 'id,postId,post:Post!inner(id)', emb,
    `GuestLike?select=id,post:Post!inner(id)&${emb}`,
  )) add(g.postId, 'guestlike')
  for (const r of await selectVerified<{ id: string; postId: string }>(
    ctx, 'Report(네이버유래)', 'Report', 'id,postId,post:Post!inner(id)', emb,
    `Report?select=id,post:Post!inner(id)&${emb}`,
  )) add(r.postId, 'report')
  // 🔴 HomeCurationOverride 는 DB 에서 RESTRICT 다 — 참조가 있으면 hard delete 가 막힌다.
  for (const h of await selectVerified<{ id: string; postId: string }>(
    ctx, 'HomeCurationOverride(네이버유래)', 'HomeCurationOverride', 'id,postId,post:Post!inner(id)', emb,
    `HomeCurationOverride?select=id,post:Post!inner(id)&${emb}`,
  )) add(h.postId, 'home-curation')

  const tombstoneIds: string[] = []
  const hardDeleteIds: string[] = []
  for (const p of posts) {
    const d = decidePost({ source: p.source, cafePostId: p.cafePostId, sourceUrl: p.sourceUrl, traces: traces.get(p.id) ?? [] })
    if (d === 'TOMBSTONE') tombstoneIds.push(p.id)
    else if (d === 'DELETE') hardDeleteIds.push(p.id)
  }

  // R2 — 보존 Post 와 객체를 공유하면 지우지 않는다.
  const navKeys = new Set(posts.map((p) => r2KeyOf(p.thumbnailUrl)).filter((k): k is string => k != null))
  const navIds = new Set(posts.map((p) => p.id))
  // 공유 객체 판정도 누락되면 **보존 Post 가 쓰는 이미지를 지우게 된다.** 같은 필터로 대조한다.
  const withThumb = await selectVerified<{ id: string; thumbnailUrl: string | null }>(
    ctx, 'Post(thumbnailUrl)', 'Post', 'id,thumbnailUrl', 'thumbnailUrl=not.is.null', 'Post?thumbnailUrl=not.is.null',
  )
  for (const other of withThumb) {
    if (navIds.has(other.id)) continue
    const k = r2KeyOf(other.thumbnailUrl)
    if (k && navKeys.has(k)) navKeys.delete(k) // 공유 객체 → 삭제 금지
  }

  // BotLog — 원문 제목 조각을 담은 행 + 카페 크롤러 전량
  const frags = [...new Set(posts.map((p) => (p.title ?? '').trim()).filter((t) => t.length >= 8).map((t) => t.slice(0, 12)))]
  const botLogIds: string[] = []
  // BotLog 도 누락되면 파생 로그가 남는다.
  const botLogs = await selectVerified<{ id: string; botType: string; details: string | null; logData: unknown }>(
    ctx, 'BotLog(전량)', 'BotLog', 'id,botType,details,logData', '', 'BotLog',
  )
  for (const b of botLogs) {
    if (b.botType === 'CAFE_CRAWLER') { botLogIds.push(b.id); continue }
    const blob = `${b.details ?? ''} ${JSON.stringify(b.logData ?? {})}`
    if (frags.some((f) => blob.includes(f))) botLogIds.push(b.id)
  }

  // hard delete 대상 글의 봇 댓글은 FK CASCADE 로 함께 사라진다 — P3 가 따로 지울 대상은 tombstone 쪽뿐이다.
  const botCommentIdsOnTombstone = tombstoneIds.flatMap((id) => botCommentsByPost.get(id) ?? [])

  return { naverPostIds: posts.map((p) => p.id), tombstoneIds, hardDeleteIds, botCommentIdsOnNaver, botCommentIdsOnTombstone, botLogIds, r2Keys: [...navKeys] }
}

// ── 라이브 카운트 ───────────────────────────────────────────────────────────
/**
 * 대상 글 위의 행을 센다.
 *
 * ⚠️ 네이버 필터로 세면 안 된다. tombstone 이 `cafePostId`·`sourceUrl` 을 비우는 순간
 * 그 글들이 필터에서 빠져 **행은 멀쩡한데 0 으로 보인다**. 그래서 항상
 * "아직 네이버 유래인 글 ∪ tombstone 서명이 붙은 글" 을 범위로 삼는다.
 */
async function countOnScope(ctx: Ctx, table: string, postIds: string[]): Promise<number> {
  let n = 0
  for (let i = 0; i < postIds.length; i += BATCH) n += await count(ctx, `${table}?postId=${quoteIn(postIds.slice(i, i + BATCH))}`)
  return n
}

async function scopeIds(ctx: Ctx, t: Targets): Promise<string[]> {
  const signed = await selectAll<{ id: string }>(ctx, 'Post', 'id', `title=eq.${encodeURIComponent(SIG)}`)
  return [...new Set([...t.naverPostIds, ...signed.map((p) => p.id)])]
}

export async function readCounts(ctx: Ctx, t: Targets): Promise<LiveCounts> {
  let r2Remaining = 0
  for (const k of t.r2Keys) if (await r2Exists(ctx, k)) r2Remaining++
  const scope = await scopeIds(ctx, t)
  return {
    naverOrigin: t.naverPostIds.length,
    naverOriginPublic: await count(ctx, `Post?${NAVER_ORIGIN_FILTER}&status=in.(PUBLISHED,SEO_ONLY)`),
    tombstoneSignature: await count(ctx, `Post?title=eq.${encodeURIComponent(SIG)}`),
    botCommentsOnNaver: t.botCommentIdsOnNaver.length,
    humanCommentsOnTombstone: EXPECTED.humanCommentsOnTombstone, // 아래에서 실측으로 덮는다
    nullAuthorCommentsOnTombstone: EXPECTED.nullAuthorCommentsOnTombstone,
    guestLikesOnNaver: await countOnScope(ctx, 'GuestLike', scope),
    reportsOnNaver: await countOnScope(ctx, 'Report', scope),
    homeCurationOnNaver: await countOnScope(ctx, 'HomeCurationOverride', scope),
    cafePost: await count(ctx, 'CafePost'),
    cafeTrend: await count(ctx, 'CafeTrend'),
    commentWaveQueue: await count(ctx, 'CommentWaveQueue'),
    botLogPurgeTargets: t.botLogIds.length,
    r2Remaining,
    publicUserPosts: await count(ctx, 'Post?source=eq.USER&status=in.(PUBLISHED,SEO_ONLY)'),
  }
}

/**
 * 보존 대상 댓글은 tombstone **대상 글 위**에서 센다.
 * tombstone 이 끝나면 그 글들은 네이버 필터에서 빠지므로, 서명(title)으로 다시 찾는다.
 */
export async function countPreservedComments(ctx: Ctx, tombstoneIds: string[]): Promise<{ human: number; nullAuthor: number }> {
  const users = await selectAll<UserRow>(ctx, 'User', 'id,providerId')
  const humans = new Set(users.filter((u) => isHumanProviderId(u.providerId)).map((u) => u.id))
  // tombstone 전에는 대상 글 id, 끝난 뒤에는 서명이 붙은 글 id — 둘을 합쳐 범위를 고정한다.
  const signed = (await selectAll<{ id: string }>(ctx, 'Post', 'id', `title=eq.${encodeURIComponent(SIG)}`)).map((p) => p.id)
  const ids = [...new Set([...tombstoneIds, ...signed])]
  let human = 0, nullAuthor = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    for (const c of await selectAll<{ id: string; authorId: string | null }>(ctx, 'Comment', 'id,authorId', `postId=${quoteIn(ids.slice(i, i + BATCH))}`)) {
      if (c.authorId == null) nullAuthor++
      else if (humans.has(c.authorId)) human++
    }
  }
  return { human, nullAuthor }
}

// ── checkpoint (단계명·건수·시각만) ─────────────────────────────────────────
type Checkpoint = { step: StepName; affected: number; at: string }[]
const cpPath = (ctx: Ctx) => ctx.checkpointPath ?? join(tmpdir(), 'unao-naver-purge-checkpoint.json')
function readCp(ctx: Ctx): Checkpoint {
  try { return JSON.parse(readFileSync(cpPath(ctx), 'utf8')) as Checkpoint } catch { return [] }
}
function appendCp(ctx: Ctx, step: StepName, affected: number): void {
  if (!ctx.execute) return
  writeFileSync(cpPath(ctx), JSON.stringify([...readCp(ctx), { step, affected, at: new Date().toISOString() }], null, 1))
}

// ── 실행 ────────────────────────────────────────────────────────────────────
export async function run(ctx: Ctx): Promise<void> {
  log({ step: 'start', dryRun: !ctx.execute })

  const targets = await resolveTargets(ctx)
  const counts = await readCounts(ctx, targets)
  const pres = await countPreservedComments(ctx, targets.tombstoneIds)
  counts.humanCommentsOnTombstone = pres.human
  counts.nullAuthorCommentsOnTombstone = pres.nullAuthor

  // 기준선은 데이터다. 운영은 실측 EXPECTED, 테스트는 fixture 값을 넣는다.
  // `publicUserPosts` 만 지금 값으로 고정한다 — 실회원이 새 글을 쓸 수 있으니 "시작과 끝이 같다"만 본다.
  const exp: PurgeExpectation = { ...(ctx.expected ?? EXPECTED), publicUserPosts: counts.publicUserPosts }

  const done = completedSteps(counts, exp)
  log({ step: 'start-state', before: counts as unknown as Record<string, number>, resumed: done.size > 0 })

  const violations = checkStartState(counts, exp)
  if (violations.length > 0) {
    for (const v of violations) log({ step: 'start-violation', key: v.key, expected: v.expected, actual: v.actual })
    throw new Error('[ABORT] 시작 상태가 허용 범위를 벗어났다 — write 없이 중단한다.')
  }

  for (const s of STEPS) log({ step: 'plan', action: s, expected: planCount(s, targets, counts), skipped: done.has(s) })

  if (!ctx.execute) { log({ step: 'dry-run-end', ok: true }); return }


  if (!done.has('P0-botlog')) {
    const n = await deleteByIds(ctx, 'P0-botlog', 'BotLog', targets.botLogIds)
    // 🔴 CAFE_CRAWLER 만 보면 원문 조각 파생 로그가 남은 채 통과한다. **대상 전체**를 다시 구해 확인한다.
    const after = (await resolveTargets(ctx)).botLogIds.length
    if (after !== 0) throw new Error(`[ABORT] P0: BotLog 폐기 대상 잔량 ${after} — 중단한다.`)
    appendCp(ctx, 'P0-botlog', n); log({ step: 'P0-botlog', affected: n, after })
  }
  if (!done.has('P1-r2')) {
    // 🔴 "이미 없던 키" 와 "이번에 지운 객체" 를 구분해 센다. 합쳐 세면 지우지 않은 것도 실적이 된다.
    let alreadyAbsent = 0, deleted = 0
    for (const k of targets.r2Keys) {
      if (!(await r2Exists(ctx, k))) { alreadyAbsent++; continue }
      await r2Delete(ctx, k)
      if (await r2Exists(ctx, k)) throw new Error('[ABORT] P1: R2 객체가 삭제 후에도 남아 있다 — 중단한다.')
      deleted++
    }
    appendCp(ctx, 'P1-r2', deleted)
    log({ step: 'P1-r2', action: 'delete', expected: targets.r2Keys.length, deleted, skipped: alreadyAbsent, after: 0 })
  }
  if (!done.has('P2-hard-delete')) {
    const n = await deleteByIds(ctx, 'P2-hard-delete', 'Post', targets.hardDeleteIds)
    const after = await count(ctx, `Post?${NAVER_ORIGIN_FILTER}`)
    if (after !== targets.tombstoneIds.length) throw new Error(`[ABORT] P2: 잔량 ${after} ≠ tombstone 대상 ${targets.tombstoneIds.length} — 중단한다.`)
    appendCp(ctx, 'P2-hard-delete', n); log({ step: 'P2-hard-delete', affected: n, after })
  }
  if (!done.has('P3-bot-comments')) {
    const ids = (await resolveTargets(ctx)).botCommentIdsOnNaver
    const n = await deleteByIds(ctx, 'P3-bot-comments', 'Comment', ids)
    const after = (await resolveTargets(ctx)).botCommentIdsOnNaver.length
    if (after !== 0) throw new Error(`[ABORT] P3: 봇 댓글 잔량 ${after} — 중단한다.`)
    appendCp(ctx, 'P3-bot-comments', n); log({ step: 'P3-bot-comments', affected: n, after })
  }
  if (!done.has('P4-tombstone')) {
    const ids = (await resolveTargets(ctx)).naverPostIds
    let patched = 0
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      const n = await mutate(ctx, 'PATCH', `Post?id=${quoteIn(chunk)}`, TOMBSTONE_PATCH)
      if (n !== chunk.length) throw new Error(`[ABORT] P4: 배치 ${chunk.length}건 요청에 실제 영향 ${n}건 — 중단한다.`)
      patched += n
    }
    const left = await count(ctx, `Post?${NAVER_ORIGIN_FILTER}`)
    if (left !== 0) throw new Error(`[ABORT] P4: 네이버 유래 잔량 ${left} — 중단한다.`)
    // 🔴 실제로 전 필드가 비워졌는지 되읽어 확인한다.
    const rows = await selectAll<Record<string, unknown> & { id: string }>(ctx, 'Post', ['id', ...Object.keys(TOMBSTONE_PATCH)].join(','), `title=eq.${encodeURIComponent(SIG)}`)
    const bad = rows.filter((r) => !isTombstoned(r)).length
    if (bad > 0) throw new Error(`[ABORT] P4: tombstone 미완 ${bad}건 — 중단한다.`)
    if (rows.length !== exp.tombstonePosts) throw new Error(`[ABORT] P4: tombstone ${rows.length} ≠ 예상 ${exp.tombstonePosts} — 중단한다.`)
    appendCp(ctx, 'P4-tombstone', patched); log({ step: 'P4-tombstone', affected: patched, after: rows.length })
  }
  for (const [step, table] of [['P5-comment-wave-queue', 'CommentWaveQueue'], ['P6-cafe-trend', 'CafeTrend'], ['P7-cafe-post', 'CafePost']] as [StepName, string][]) {
    if (done.has(step)) continue
    const before = await count(ctx, table)
    const ids = (await selectAll<{ id: string }>(ctx, table, 'id')).map((r) => r.id)
    const n = await deleteByIds(ctx, step, table, ids)
    const after = await count(ctx, table)
    if (after !== 0) throw new Error(`[ABORT] ${step}: ${table} 잔량 ${after} — 중단한다.`)
    appendCp(ctx, step, n); log({ step, table, before, affected: n, after })
  }

  // 🔴 최종 검증 — 통과 전에는 done 을 찍지 않는다.
  const finalTargets = await resolveTargets(ctx)
  const finalCounts = await readCounts(ctx, finalTargets)
  const fp = await countPreservedComments(ctx, [])
  finalCounts.humanCommentsOnTombstone = fp.human
  finalCounts.nullAuthorCommentsOnTombstone = fp.nullAuthor
  const fv = checkFinalState(finalCounts, exp)
  log({ step: 'verify', after: finalCounts as unknown as Record<string, number> })
  if (fv.length > 0) {
    for (const v of fv) log({ step: 'final-violation', key: v.key, expected: v.expected, actual: v.actual })
    throw new Error('[ABORT] 최종 검증 실패 — done 을 선언하지 않는다.')
  }
  log({ step: 'done', ok: true })
}

function planCount(s: StepName, t: Targets, c: LiveCounts): number {
  switch (s) {
    case 'P0-botlog': return t.botLogIds.length
    case 'P1-r2': return t.r2Keys.length
    case 'P2-hard-delete': return t.hardDeleteIds.length
    case 'P3-bot-comments': return t.botCommentIdsOnTombstone.length
    case 'P4-tombstone': return t.tombstoneIds.length
    case 'P5-comment-wave-queue': return c.commentWaveQueue
    case 'P6-cafe-trend': return c.cafeTrend
    case 'P7-cafe-post': return c.cafePost
  }
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[ABORT] NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요하다.')
  const ref = projectRefOf(url)
  if (!isProductionProjectRef(ref)) throw new Error('[ABORT] production project ref 가 아니다 — 중단한다.')

  const args = parseArgs(argv)
  const execute = isExecutionAuthorized(args, ref)
  if (args.execute && !execute) throw new Error('[ABORT] --confirm 토큰이 없거나 다르다 — write 하지 않는다.')

  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_R2_ACCESS_KEY: accessKey, CLOUDFLARE_R2_SECRET_KEY: secretKey, CLOUDFLARE_R2_BUCKET: bucket } = process.env
  const r2 = accountId && accessKey && secretKey && bucket ? { accountId, accessKey, secretKey, bucket } : undefined
  if (execute && !r2) throw new Error('[ABORT] R2 자격증명이 없다 — 외부 잔재를 못 지우므로 실행하지 않는다.')

  await run({ url, key, execute, fetch, r2 })
}

const invokedDirectly = process.argv[1]?.includes('purge-naver-cafe-data')
if (invokedDirectly) main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1) })
