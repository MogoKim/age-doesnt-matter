/**
 * 네이버 카페 유래 데이터 영구 폐기 — **일회성 도구**.
 *
 * 실행:
 *   dry-run  npx tsx --env-file=<env> agents/scripts/purge-naver-cafe-data.ts
 *   실제     npx tsx --env-file=<env> agents/scripts/purge-naver-cafe-data.ts --execute --confirm=<토큰>
 *
 * 설계 원칙
 *  - 기본은 dry-run. `--execute` **와** `--confirm` 둘 다 있어야만 write 한다.
 *  - 대상 판정은 전부 `agents/purge/naver-origin-policy.ts` 의 순수 함수를 쓴다 — dry-run 과 execute 가 같은 답을 낸다.
 *  - 단계마다 처리 전후 exact count 를 확인한다.
 *  - 본문·제목·댓글·닉네임·row ID·secret 을 로그에 남기지 않는다.
 *  - 중간에 죽어도 다시 돌리면 남은 것만 처리한다(멱등). 대상은 매 실행 라이브 데이터에서 다시 구한다.
 *  - Prisma 를 쓰지 않는다 — 운영 DIRECT_URL 인증이 실패 상태라 Supabase REST 로만 접근한다.
 *  - raw SQL·RPC 를 쓰지 않는다.
 *
 * 실행이 끝나면 이 파일과 `agents/purge/` 는 별도 PR 로 제거한다(일회성).
 */
import {
  PRODUCTION_PROJECT_REF, NAVER_ORIGIN_FILTER, BOT_AUTHOR_FILTER, HUMAN_AUTHOR_FILTER,
  EXPECTED, checkBaseline, decidePost, assertNoUserPosts, assertMutationIsScoped,
  TOMBSTONE_PATCH, redactForLog, type BaselineActual,
} from '../purge/naver-origin-policy.js'

const BATCH = 50           // id=in.(...) 한 번에 보낼 개수 — URL 길이 안전선
const ID_PAGE = 1000       // 목록 조회 페이지 크기

export type Ctx = { url: string; key: string; execute: boolean }

export function parseArgs(argv: string[]): { execute: boolean; confirm: string | null } {
  const execute = argv.includes('--execute')
  const c = argv.find((a) => a.startsWith('--confirm='))
  return { execute, confirm: c ? c.slice('--confirm='.length) : null }
}

export function projectRefOf(url: string): string {
  return new URL(url).host.split('.')[0]
}

/** 실제 write 를 허용할지. 토큰은 project ref 와 같아야 한다 — 손이 미끄러져 켜지지 않게. */
export function isExecutionAuthorized(a: { execute: boolean; confirm: string | null }, projectRef: string): boolean {
  return a.execute && a.confirm === `PURGE-${projectRef}`
}

function log(o: Record<string, unknown>): void {
  console.log(JSON.stringify(redactForLog({ at: new Date().toISOString(), ...o })))
}

// ── REST ────────────────────────────────────────────────────────────────────
function headers(ctx: Ctx, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: ctx.key, Authorization: `Bearer ${ctx.key}`, ...extra }
}

export async function count(ctx: Ctx, path: string): Promise<number> {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${ctx.url}/rest/v1/${path}${sep}select=id&limit=1`, {
    headers: headers(ctx, { Prefer: 'count=exact' }),
  })
  if (!r.ok) throw new Error(`count 실패 ${r.status}`)
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1])
}

async function selectAll<T>(ctx: Ctx, path: string): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += ID_PAGE) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await fetch(`${ctx.url}/rest/v1/${path}${sep}offset=${off}&limit=${ID_PAGE}`, { headers: headers(ctx) })
    if (!r.ok) throw new Error(`select 실패 ${r.status}`)
    const j = (await r.json()) as T[]
    out.push(...j)
    if (j.length < ID_PAGE) return out
  }
}

/** 필터가 반드시 있는 mutation. `allowFullTable` 은 호출부가 의도를 밝힐 때만 쓴다. */
async function mutate(ctx: Ctx, method: 'DELETE' | 'PATCH', path: string, body?: unknown, opts: { allowFullTable?: boolean } = {}): Promise<void> {
  assertMutationIsScoped(path, opts)
  if (!ctx.execute) throw new Error('[GUARD] dry-run 에서 mutate 가 호출됐다 — 버그다.')
  const r = await fetch(`${ctx.url}/rest/v1/${path}`, {
    method,
    headers: headers(ctx, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!r.ok) throw new Error(`${method} 실패 ${r.status}`)
}

const quoteIn = (ids: string[]) => `in.(${ids.map((i) => `"${i}"`).join(',')})`

// ── 대상 판정 (dry-run·execute 공용) ────────────────────────────────────────
export type Targets = {
  naverOriginIds: string[]
  tombstoneIds: string[]
  hardDeleteIds: string[]
  botCommentIdsOnTombstone: string[]
}

export async function resolveTargets(ctx: Ctx): Promise<Targets> {
  const posts = await selectAll<{ id: string; source: string; cafePostId: string | null; sourceUrl: string | null }>(
    ctx, `Post?select=id,source,cafePostId,sourceUrl&${NAVER_ORIGIN_FILTER}`,
  )
  // 🔴 대상 집합에 USER 가 섞이면 여기서 멈춘다.
  assertNoUserPosts(posts)

  const human = new Set<string>()
  const collect = async (path: string) => {
    for (const row of await selectAll<{ postId: string | null }>(ctx, path)) if (row.postId) human.add(row.postId)
  }
  const nav = NAVER_ORIGIN_FILTER.replace(/^or=/, 'post.or=')
  await collect(`Comment?select=postId,post:Post!inner(id),author:User!inner(providerId)&${nav}&author.${HUMAN_AUTHOR_FILTER}`)
  await collect(`Comment?select=postId,post:Post!inner(id)&${nav}&authorId=is.null`)
  await collect(`Like?select=postId,post:Post!inner(id),user:User!inner(providerId)&${nav}&user.${HUMAN_AUTHOR_FILTER}`)
  await collect(`GuestLike?select=postId,post:Post!inner(id)&${nav}`)
  await collect(`Report?select=postId,post:Post!inner(id)&${nav}`)

  const tombstoneIds: string[] = []
  const hardDeleteIds: string[] = []
  for (const p of posts) {
    const d = decidePost({ source: p.source, cafePostId: p.cafePostId, sourceUrl: p.sourceUrl, hasHumanTrace: human.has(p.id) })
    if (d === 'TOMBSTONE') tombstoneIds.push(p.id)
    else if (d === 'DELETE') hardDeleteIds.push(p.id)
  }

  // tombstone 으로 남길 글 위의 **봇 댓글만** 삭제 대상이다. 실회원·게스트 댓글은 건드리지 않는다.
  const botCommentIdsOnTombstone: string[] = []
  for (let i = 0; i < tombstoneIds.length; i += BATCH) {
    const chunk = tombstoneIds.slice(i, i + BATCH)
    const rows = await selectAll<{ id: string }>(
      ctx, `Comment?select=id,author:User!inner(providerId)&postId=${quoteIn(chunk)}&author.${BOT_AUTHOR_FILTER}`,
    )
    botCommentIdsOnTombstone.push(...rows.map((r) => r.id))
  }

  return { naverOriginIds: posts.map((p) => p.id), tombstoneIds, hardDeleteIds, botCommentIdsOnTombstone }
}

export async function readBaseline(ctx: Ctx, t: Targets): Promise<BaselineActual> {
  return {
    postTotal: await count(ctx, 'Post'),
    naverOrigin: t.naverOriginIds.length,
    naverOriginPublic: await count(ctx, `Post?${NAVER_ORIGIN_FILTER}&status=in.(PUBLISHED,SEO_ONLY)`),
    tombstonePosts: t.tombstoneIds.length,
    hardDeletePosts: t.hardDeleteIds.length,
    cafePost: await count(ctx, 'CafePost'),
    cafeTrend: await count(ctx, 'CafeTrend'),
    commentWaveQueue: await count(ctx, 'CommentWaveQueue'),
  }
}

// ── 실행 단계 ───────────────────────────────────────────────────────────────
async function deleteByIds(ctx: Ctx, table: string, ids: string[]): Promise<number> {
  let done = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    await mutate(ctx, 'DELETE', `${table}?id=${quoteIn(chunk)}`)
    done += chunk.length
    if (i % (BATCH * 20) === 0) log({ step: table, action: 'delete-progress', deleted: done })
  }
  return done
}

export async function run(ctx: Ctx): Promise<void> {
  log({ step: 'start', dryRun: !ctx.execute })

  const targets = await resolveTargets(ctx)
  const before = await readBaseline(ctx, targets)
  const violations = checkBaseline(before)
  log({ step: 'baseline', before, expected: EXPECTED as unknown as Record<string, number> })
  if (violations.length > 0) {
    for (const v of violations) log({ step: 'baseline-violation', key: v.key, expected: v.expected, actual: v.actual })
    throw new Error('[ABORT] 기준 건수가 예상 범위를 벗어났다 — write 없이 중단한다.')
  }

  log({ step: 'plan', action: 'tombstone-posts', expected: targets.tombstoneIds.length })
  log({ step: 'plan', action: 'hard-delete-posts', expected: targets.hardDeleteIds.length })
  log({ step: 'plan', action: 'delete-bot-comments-on-tombstone', expected: targets.botCommentIdsOnTombstone.length })
  log({ step: 'plan', action: 'delete-CafePost', expected: before.cafePost })
  log({ step: 'plan', action: 'delete-CafeTrend', expected: before.cafeTrend })
  log({ step: 'plan', action: 'delete-CommentWaveQueue', expected: before.commentWaveQueue })

  if (!ctx.execute) {
    log({ step: 'dry-run-end', ok: true })
    return
  }

  // S1. tombstone 대상 글의 봇 댓글 삭제 (실회원·게스트 댓글은 남긴다)
  {
    const before1 = targets.botCommentIdsOnTombstone.length
    const n = await deleteByIds(ctx, 'Comment', targets.botCommentIdsOnTombstone)
    log({ step: 'S1', table: 'Comment', action: 'delete-bot-on-tombstone', before: before1, deleted: n })
  }
  // S2. tombstone — 복원 가능한 콘텐츠 필드 제거
  {
    let patched = 0
    for (let i = 0; i < targets.tombstoneIds.length; i += BATCH) {
      const chunk = targets.tombstoneIds.slice(i, i + BATCH)
      await mutate(ctx, 'PATCH', `Post?id=${quoteIn(chunk)}`, TOMBSTONE_PATCH)
      patched += chunk.length
    }
    // tombstone 이 끝나면 `cafePostId`·`sourceUrl` 이 비어 이 글들은 더 이상 네이버 유래 필터에 걸리지 않는다.
    const stillMatching = await count(ctx, `Post?${NAVER_ORIGIN_FILTER}`)
    log({ step: 'S2', table: 'Post', action: 'tombstone', patched, after: stillMatching })
  }
  // S3. hard delete — Comment·Like·GuestLike·PostView·HomeCurationOverride 는 FK cascade 로 함께 사라진다
  {
    const n = await deleteByIds(ctx, 'Post', targets.hardDeleteIds)
    const after = await count(ctx, `Post?${NAVER_ORIGIN_FILTER}`)
    log({ step: 'S3', table: 'Post', action: 'hard-delete', deleted: n, after })
  }
  // S4~S6. 네이버 원문·파생 텍스트 테이블 전체 폐기 (전체 삭제가 의도 — 명시적으로 허용)
  for (const table of ['CommentWaveQueue', 'CafeTrend', 'CafePost'] as const) {
    const b = await count(ctx, table)
    // 전체 폐기가 의도이지만 무필터 요청은 쓰지 않는다 — `id=not.is.null` 로 범위를 명시한다.
    await mutate(ctx, 'DELETE', `${table}?id=not.is.null`)
    const a = await count(ctx, table)
    log({ step: 'S4-6', table, action: 'delete-all', before: b, after: a })
  }

  const afterAll = await readBaseline(ctx, await resolveTargets(ctx))
  log({ step: 'verify', after: afterAll })
  log({ step: 'done', ok: true })
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[ABORT] NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요하다.')

  const ref = projectRefOf(url)
  if (ref !== PRODUCTION_PROJECT_REF) throw new Error('[ABORT] production project ref 가 아니다 — 중단한다.')

  const args = parseArgs(argv)
  const execute = isExecutionAuthorized(args, ref)
  if (args.execute && !execute) throw new Error('[ABORT] --confirm 토큰이 없거나 다르다 — write 하지 않는다.')

  await run({ url, key, execute })
}

const invokedDirectly = process.argv[1]?.includes('purge-naver-cafe-data')
if (invokedDirectly) main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1) })
