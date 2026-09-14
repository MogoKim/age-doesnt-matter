// LOCAL ONLY — 공개 콘텐츠 628건 영구 삭제. 크론에 연결하지 않는다(수동 전용).
//
// 🔴 되돌릴 수 없다. hard delete 는 복구 경로가 없다.
//
// 실행:
//   dry-run  npx tsx agents/cron/runner.ts coo public-content-purge
//   실제     npx tsx agents/cron/runner.ts coo public-content-purge -- \
//              --execute --confirm=PURGE-PUBLIC-CONTENT-628
//   R2 재개  ... -- --execute --confirm=... --r2-only
//
// 정책
//  - `agents/CLAUDE.md`: **DB write 는 COO 만 가능.** 그래서 이 파일이 유일한 실행 입구다.
//    (이전 판의 `PURGE_AGENT_ID` 환경변수 게이트는 문자열 위장이라 제거했다 —
//     아무나 값을 넣으면 통과했다. 이제 COO 모듈이 아니면 실행 경로 자체가 없다.)
//  - Raw SQL·REST write 를 쓰지 않는다. `agents/core/db.ts` 의 Prisma 만 쓴다.
//  - 스케줄에 연결하지 않는다. `--execute` 와 확인 토큰이 둘 다 있어야 쓴다.
//
// 🔇 로그: ID·제목·본문·R2 키·개인정보를 쓰지 않는다. 지문과 집계만 남긴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseCsv, toPurgeRows, buildPlan, detectDrift, assertCsvIntegrity, assertR2ManifestIntegrity,
  classifyRunState, blockingSemanticIssues, verifyAfterPurge, isRealMember, isGuestComment,
  classifyCompletion, canRunR2Only, sha12, tag, EXIT_CODE,
  CONFIRM_TOKEN, EXPECTED_TOTAL, EXPECTED_PRESERVE_TOTAL, R2_MANIFEST_KEYS, SEMANTIC_REFS,
  type PurgeRow, type LiveRow, type PlanIssue, type SemanticCount, type CompletionState, type R2Outcome,
} from '../purge/public-content-policy.js'
import {
  liveReferencedKeys, protectedManifestKeys, deletableManifestKeys,
  type PostImageSource, type ForeignImageSource,
} from '../purge/r2-objects.js'
import { executePurge, linkPointsToPost, type TransactionRunner } from '../purge/public-content-exec.js'
import { runR2Cleanup, type R2Config, type FetchLike } from '../purge/r2-client.js'

const CSV_PATH = 'docs/operations/data/2026-09-14-public-content-purge.csv'
const R2_MANIFEST_PATH = 'docs/operations/data/2026-09-14-public-content-purge-r2.txt'
const TIER1_CSV = 'docs/operations/data/2026-09-11-public-content-disposition.csv'
const TIER2_CSV = 'docs/operations/data/2026-09-11-review-tier2.csv'

export interface Args { execute: boolean; confirm: string | null; r2Only: boolean }

export function parseArgs(argv: readonly string[]): Args {
  const c = argv.find((a) => a.startsWith('--confirm='))
  return {
    execute: argv.includes('--execute'),
    confirm: c ? c.slice('--confirm='.length) : null,
    r2Only: argv.includes('--r2-only'),
  }
}

export function isExecutionAuthorized(a: Args): boolean {
  return a.execute && a.confirm === CONFIRM_TOKEN
}

/** 보존 경계를 역사적 CSV 두 장에서 다시 만든다 — 코드에 ID 를 박지 않는다. */
export function preserveIdsFrom(tier1: string, tier2: string): string[] {
  const t1 = parseCsv(tier1)
  const t2 = parseCsv(tier2)
  const keep = new Set<string>()
  const [h1, ...b1] = t1
  const v1 = h1.indexOf('verdict'); const i1 = h1.indexOf('id')
  for (const r of b1) if (r[v1] === 'PRESERVE') keep.add(r[i1])
  const [h2, ...b2] = t2
  const a2 = h2.indexOf('recommendedAction'); const i2 = h2.indexOf('id'); const p2 = h2.indexOf('protectedFromHideDelete')
  const KEEP2 = new Set(['PRESERVE', 'REWRITE_AUTO_COMPOSED', 'REWRITE_BRAND_COPY'])
  for (const r of b2) if (KEEP2.has(r[a2]) || r[p2] === 'true') keep.add(r[i2])
  return [...keep]
}


function out(line: string): void { console.log(line) }
function issuesOut(label: string, issues: readonly PlanIssue[]): void {
  out(`\n  ${label}: ${issues.length}건`)
  for (const i of issues.slice(0, 20)) out(`    - ${i.code} · ${i.detail}`)
  if (issues.length > 20) out(`    … 외 ${issues.length - 20}건`)
}

function r2ConfigFromEnv(): R2Config | null {
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_R2_ACCESS_KEY: accessKey,
          CLOUDFLARE_R2_SECRET_KEY: secretKey, CLOUDFLARE_R2_BUCKET: bucket } = process.env
  return accountId && accessKey && secretKey && bucket ? { accountId, accessKey, secretKey, bucket } : null
}

/**
 * DB 는 **지연 로드**한다.
 *
 * `agents/core/db.ts` 는 top-level 에서 `new URL(DATABASE_URL)` 을 실행한다.
 * 모듈 상단에서 import 하면 테스트가 이 파일을 읽는 것만으로 연결을 시도하고
 * 빈 URL 에 터진다. import 는 아무것도 하지 않아야 한다.
 */
async function db() {
  return import('../core/db.js')
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<CompletionState> {
  const { prisma, disconnect } = await db()
  const args = parseArgs(argv)
  const authorized = isExecutionAuthorized(args)
  if (args.execute && !authorized) {
    throw new Error(`[ABORT] --confirm 토큰이 없거나 다르다. 필요한 값: ${CONFIRM_TOKEN}`)
  }

  out('━'.repeat(66))
  out(`  [COO] 공개 콘텐츠 영구 삭제 — ${authorized ? '🔴 실행 모드' : 'dry-run (write 0)'}`)
  out('━'.repeat(66))

  const root = process.cwd()
  const raw = readFileSync(resolve(root, CSV_PATH), 'utf8')
  assertCsvIntegrity(raw)
  const rows: PurgeRow[] = toPurgeRows(parseCsv(raw))
  const manifestRaw = readFileSync(resolve(root, R2_MANIFEST_PATH), 'utf8')
  assertR2ManifestIntegrity(manifestRaw)
  const manifestKeys = manifestRaw.trim().split('\n')
  out(`\n확정 CSV ${rows.length}행 · R2 manifest ${manifestKeys.length}키 — 무결성 통과`)
  if (manifestKeys.length !== R2_MANIFEST_KEYS) {
    throw new Error(`[ABORT] manifest 키 수 ${manifestKeys.length} ≠ 기대 ${R2_MANIFEST_KEYS}`)
  }

  const keep = preserveIdsFrom(
    readFileSync(resolve(root, TIER1_CSV), 'utf8'),
    readFileSync(resolve(root, TIER2_CSV), 'utf8'),
  )
  const plan = buildPlan(rows, keep)
  out(`보존 경계 ${keep.length}건 (기대 ${EXPECTED_PRESERVE_TOTAL})`)
  if (plan.issues.length > 0) {
    issuesOut('계획 이슈', plan.issues)
    throw new Error('[ABORT] 계획 단계 불일치 — mutation 0 상태로 중단한다.')
  }
  out('계획 이슈: 0건')

  const ids = rows.map((r) => r.id)

  try {
    // ── preflight (read-only) ──────────────────────────────────
    const posts = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, boardType: true, status: true, source: true, authorId: true,
        title: true, content: true, updatedAt: true, thumbnailUrl: true, slug: true,
        author: { select: { providerId: true, role: true, status: true } },
      },
    })
    const state = classifyRunState(EXPECTED_TOTAL, posts.length)
    out(`\n재실행 판정: ${state} (남은 후보 ${posts.length}/${EXPECTED_TOTAL})`)

    const preserveBefore = await prisma.post.count({ where: { id: { in: keep } } })
    if (preserveBefore !== keep.length) {
      throw new Error(`[ABORT] 보존 대상이 이미 줄었다 — ${preserveBefore}/${keep.length}`)
    }

    // ── 보호 신호 (preflight) ──────────────────────────────────
    const comments = await prisma.comment.findMany({
      where: { postId: { in: ids } },
      select: {
        postId: true, authorId: true, guestNickname: true, guestPasswordHash: true,
        author: { select: { providerId: true, role: true, status: true } },
      },
    })
    const likes = await prisma.like.findMany({
      where: { postId: { in: ids } },
      select: { postId: true, user: { select: { providerId: true, role: true, status: true } } },
    })
    const scraps = await prisma.scrap.findMany({
      where: { postId: { in: ids } },
      select: { postId: true, user: { select: { providerId: true, role: true, status: true } } },
    })
    const realComment = new Set(comments.filter((c) => isRealMember(c.author)).map((c) => c.postId))
    const guestComment = new Set(comments.filter(isGuestComment).map((c) => c.postId))
    const realLike = new Set(likes.filter((l) => isRealMember(l.user)).map((l) => l.postId ?? ''))
    const realScrap = new Set(scraps.filter((s) => isRealMember(s.user)).map((s) => s.postId))

    const live: LiveRow[] = posts.map((p) => ({
      id: p.id, boardType: p.boardType, status: p.status, source: p.source ?? '',
      authorIdSha256_12: p.authorId ? sha12(p.authorId) : '',
      titleSha256_12: sha12(p.title), contentSha256_12: sha12(p.content),
      updatedAt: p.updatedAt.toISOString(),
      hasRealAuthor: isRealMember(p.author),
      hasRealComment: realComment.has(p.id),
      hasGuestComment: guestComment.has(p.id),
      hasRealLike: realLike.has(p.id),
      hasRealScrap: realScrap.has(p.id),
    }))
    const protectedNow = live.filter(
      (l) => l.hasRealAuthor || l.hasRealComment || l.hasGuestComment || l.hasRealLike || l.hasRealScrap,
    ).length

    /**
     * 🔴 보호 키는 **지금 살아 있는 참조 전부**로 계산한다.
     *
     * 삭제 대상·삭제한 ID 는 입력이 아니다. 그것들로 좁히면
     * "보호돼 살아남은 글만 쓰는 키"가 공유로 안 잡혀 지워진다.
     * 커밋 뒤에 부르면 남아 있는 글이 자동으로 반영된다.
     */
    const computeSharedKeys = async (): Promise<Set<string>> => {
      const livePosts: PostImageSource[] = await prisma.post.findMany({
        select: { id: true, thumbnailUrl: true, content: true },
      })
      const foreign: ForeignImageSource[] = [
        { model: 'SocialPost', urls: (await prisma.socialPost.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
        { model: 'ChannelDraft', urls: (await prisma.channelDraft.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
        { model: 'NaverBlogQueue', urls: (await prisma.naverBlogQueue.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
        { model: 'Banner', urls: (await prisma.banner.findMany({ select: { imageUrl: true } })).map((b) => b.imageUrl).filter((u): u is string => !!u) },
      ]
      const live = liveReferencedKeys(livePosts, foreign)
      const shared = protectedManifestKeys(manifestKeys, live)
      const deletable = deletableManifestKeys(manifestKeys, live)
      out(`── R2 보호 판정 ── manifest ${manifestKeys.length} · 살아 있는 참조로 보호 ${shared.length} · 삭제 후보 ${deletable.length}`)
      return new Set(shared)
    }

    const runR2 = async (sharedKeys: ReadonlySet<string>): Promise<R2Outcome> => {
      const cfg = r2ConfigFromEnv()
      if (!cfg) {
        out('\n── R2 ── 자격증명이 없다 — 이미지를 지우지 못했다')
        return { skippedNoCredentials: true, uncertain: 0, remaining: manifestKeys.length - sharedKeys.size }
      }
      const s = await runR2Cleanup(fetch as unknown as FetchLike, cfg, manifestKeys, sharedKeys)
      out(`\n── R2 ── 삭제 ${s.deleted} · 이미 없음 ${s.alreadyGone} · 공유 제외 ${s.sharedSkipped} · 불확실 ${s.uncertain} · 잔존 ${s.remaining}`)
      return { skippedNoCredentials: false, uncertain: s.uncertain, remaining: s.remaining }
    }

    const report = (st: CompletionState): CompletionState => {
      out('\n' + '─'.repeat(66))
      out(`  상태: ${st}`)
      if (st === 'DB_COMPLETE_R2_PENDING') {
        out('  DB 는 끝났지만 이미지가 남았다 — done 이 아니다.')
        out('  재개: npx tsx agents/coo/public-content-purge.ts --execute --confirm=<토큰> --r2-only')
      }
      out('─'.repeat(66))
      return st
    }

    // ── --r2-only 게이트 ───────────────────────────────────────
    if (args.r2Only) {
      const gate = canRunR2Only(state, posts.length, protectedNow)
      out(`\n--r2-only 판정: ${gate.allowed ? '허용' : '거부'} — ${gate.reason}`)
      if (!gate.allowed) {
        throw new Error('[ABORT] --r2-only 를 쓸 수 없다 — 살아 있는 글의 이미지를 지우게 된다.')
      }
      const shared = await computeSharedKeys()
      if (!authorized) return report('DRY_RUN')
      const r2 = await runR2(shared)
      return report(classifyCompletion(false, r2))
    }

    if (state === 'COMPLETE') {
      out('\nDB 는 이미 COMPLETE — 남은 R2 정리만 이어간다.')
      const shared = await computeSharedKeys()
      if (!authorized) return report('DRY_RUN')
      const r2 = await runR2(shared)
      return report(classifyCompletion(false, r2))
    }
    if (state === 'PARTIAL') {
      throw new Error('[ABORT] 후보가 일부만 남아 있다 — 자동으로 이어서 지우지 않는다. 사람이 확인해야 한다.')
    }

    // ── drift ─────────────────────────────────────────────────
    const drift = detectDrift(rows, live)
    if (drift.issues.length > 0) {
      issuesOut('drift 이슈', drift.issues)
      throw new Error('[ABORT] 실행 직전 불일치 — mutation 0 상태로 중단한다.')
    }
    out('drift 이슈: 0건')
    if (drift.observations.length > 0) {
      out(`  (관측 ${drift.observations.length}건 — 막지 않음: updatedAt 만 바뀐 글. 본문·제목은 동일)`)
    }
    out(`\n삭제 후보 ${drift.deletable.length}건 · 보호 자동 제외 ${drift.protectedExclusions.length}건`)

    const doomedSet = new Set(drift.deletable)
    const bt: Record<string, number> = {}
    for (const p of posts) if (doomedSet.has(p.id)) bt[p.boardType] = (bt[p.boardType] ?? 0) + 1
    out(`boardType: ${JSON.stringify(bt)}`)

    // ── semantic 평문 참조 (preflight) ─────────────────────────
    const semantic = await semanticCounts(prisma, [...doomedSet], posts)
    out('\n── semantic 평문 참조 ──')
    const policyOf = new Map(SEMANTIC_REFS.map((r) => [`${r.model}.${r.field}`, r.policy]))
    for (const s of semantic) out(`  ${`${s.model}.${s.field}`.padEnd(32)} ${String(s.count).padStart(4)}  ${policyOf.get(`${s.model}.${s.field}`)}`)

    const blocking = blockingSemanticIssues(semantic)
    if (blocking.length > 0) {
      issuesOut('살아 있는 참조', blocking)
      throw new Error('[ABORT] 활성 이벤트/투표가 대상 글을 가리킨다 — mutation 0 으로 중단한다.')
    }

    if (!authorized) {
      await computeSharedKeys()
      // dry-run 시점에는 후보 628건이 아직 살아 있어 **전건이 보호**로 잡힌다 — 정상이다.
      // 운영자가 "지우면 몇 개가 빠지는가"를 볼 수 있게 **미리보기**만 따로 계산한다.
      // 🔴 이 값은 어떤 판정에도 쓰이지 않는다. 실제 보호는 커밋 뒤 재계산이 정한다.
      await previewAfterDelete(prisma, manifestKeys, doomedSet, out)
      out(`\n── R2 (dry-run) ── manifest ${manifestKeys.length}키 · 삭제 0`)
      return report('DRY_RUN')
    }

    // ── 실행 ──────────────────────────────────────────────────
    const runner: TransactionRunner = {
      $transaction: (fn, options) => prisma.$transaction(fn as never, options as never) as never,
    }
    const result = await executePurge(runner, {
      sha12,
      candidates: rows.filter((r) => doomedSet.has(r.id)),
      expectedMax: doomedSet.size,
    })
    out('\n── 실제 삭제 ──')
    for (const st of result.steps) out(`  ${st.step.padEnd(30)} ${st.affected}`)
    out(`  트랜잭션 내 보호 제외: ${result.protectedInTx.length}건`)

    // ── 사후 검증 — 통과해야만 done 을 말한다 ───────────────────
    const deletedIds = result.deletedIds
    // 🔴 차분이 아니라 **삭제한 ID 기준 잔량**을 본다.
    //    보호된 글의 자식 행은 남아 있는 게 맞으므로 차분은 오판을 만든다.
    const childResidual = Object.entries(await tableCounts(prisma, deletedIds))
      .map(([table, remaining]) => ({ table, remaining }))
    const protectedIds = [...drift.protectedExclusions, ...result.protectedInTx]
    const residual = await semanticCounts(prisma, deletedIds, posts)
    const check = verifyAfterPurge({
      deletedRemaining: await prisma.post.count({ where: { id: { in: deletedIds } } }),
      deletedCount: result.deleted,
      preserveBefore,
      preserveAfter: await prisma.post.count({ where: { id: { in: keep } } }),
      protectedExpected: protectedIds.length,
      protectedRemaining: protectedIds.length ? await prisma.post.count({ where: { id: { in: protectedIds } } }) : 0,
      semanticResidual: residual,
      childResidual,
    })
    if (check.length > 0) {
      issuesOut('사후 검증 실패', check)
      throw new Error('[ABORT] 삭제는 커밋됐지만 사후 검증을 통과하지 못했다 — done 이라고 말하지 않는다.')
    }
    out('\n사후 검증: 이슈 0건 (semantic 8종 전부 확인)')
    out(`  트랜잭션 확정 cascade: ${JSON.stringify(result.cascade)}`)

    // 🔴 보호 키는 **커밋 뒤** 살아 있는 참조로 다시 센다 — 트랜잭션에서 새로 보호된
    //    글이 그때 livePosts 에 들어가므로 그 이미지가 자동으로 보호된다.
    out('\n커밋 후 보호 키 재계산:')
    const sharedAfter = await computeSharedKeys()
    const r2 = await runR2(sharedAfter)
    return report(classifyCompletion(true, r2))
  } finally {
    await disconnect()
  }
}

type PrismaLike = Awaited<ReturnType<typeof db>>['prisma']

/**
 * dry-run 전용 미리보기 — "지우고 나면 몇 개가 삭제 후보가 되는가".
 *
 * 🔴 **판정에 쓰지 않는다.** 실제 보호 집합은 커밋 뒤 `computeSharedKeys()` 가 정하며,
 *    그쪽은 삭제 대상을 입력으로 받지 않는다. 이 함수는 보고용 숫자일 뿐이다.
 */
async function previewAfterDelete(
  prisma: PrismaLike,
  manifestKeys: readonly string[],
  doomed: ReadonlySet<string>,
  out: (l: string) => void,
): Promise<void> {
  const survivors: PostImageSource[] = (await prisma.post.findMany({
    select: { id: true, thumbnailUrl: true, content: true },
  })).filter((p) => !doomed.has(p.id))
  const foreign: ForeignImageSource[] = [
    { model: 'SocialPost', urls: (await prisma.socialPost.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
    { model: 'ChannelDraft', urls: (await prisma.channelDraft.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
    { model: 'NaverBlogQueue', urls: (await prisma.naverBlogQueue.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
    { model: 'Banner', urls: (await prisma.banner.findMany({ select: { imageUrl: true } })).map((b) => b.imageUrl).filter((u): u is string => !!u) },
  ]
  const live = liveReferencedKeys(survivors, foreign)
  const willProtect = protectedManifestKeys(manifestKeys, live).length
  const willDelete = deletableManifestKeys(manifestKeys, live).length
  out(`   (미리보기 — 삭제 후 기준: 보호 ${willProtect} · 삭제 예정 ${willDelete})`)
}

/**
 * semantic 평문 참조 **8종 전부**를 센다.
 *
 * 실행 전에는 "막을 것이 있는가"를, 실행 후에는 "잔재가 남았는가"를 같은 함수로 본다.
 * 축을 빼먹으면 `verifyAfterPurge` 가 `SEMANTIC_NOT_CHECKED` 로 잡는다.
 */
async function semanticCounts(
  prisma: PrismaLike,
  ids: string[],
  posts: readonly { id: string; slug: string | null }[],
): Promise<SemanticCount[]> {
  const target = new Set(ids)
  const slugged = posts.filter((p) => target.has(p.id))
  const hits = (rows: readonly { linkUrl: string | null }[]) =>
    rows.filter((r) => r.linkUrl !== null && slugged.some((p) => linkPointsToPost(r.linkUrl!, p.id, p.slug))).length

  return [
    { model: 'VoteEvent', field: 'linkedPostId', count: await prisma.voteEvent.count({ where: { linkedPostId: { in: ids } } }) },
    { model: 'Event', field: 'bodyPostId', count: await prisma.event.count({ where: { bodyPostId: { in: ids } } }) },
    { model: 'User', field: 'firstGreetingPostId', count: await prisma.user.count({ where: { firstGreetingPostId: { in: ids } } }) },
    { model: 'NaverBlogQueue', field: 'magazinePostId', count: await prisma.naverBlogQueue.count({ where: { magazinePostId: { in: ids } } }) },
    { model: 'SocialPost', field: 'sourcePostId', count: await prisma.socialPost.count({ where: { sourcePostId: { in: ids } } }) },
    { model: 'SocialPost', field: 'linkUrl', count: hits(await prisma.socialPost.findMany({ select: { linkUrl: true } })) },
    { model: 'ChannelDraft', field: 'linkUrl', count: hits(await prisma.channelDraft.findMany({ select: { linkUrl: true } })) },
    { model: 'AdminAuditLog', field: 'targetId', count: await prisma.adminAuditLog.count({ where: { targetId: { in: ids } } }) },
  ]
}

/** CASCADE 실제 감소량을 재기 위한 스냅샷. */
async function tableCounts(prisma: PrismaLike, ids: string[]): Promise<Record<string, number>> {
  const where = { postId: { in: ids } }
  const commentIds = (await prisma.comment.findMany({ where, select: { id: true } })).map((c) => c.id)
  const byComment = { commentId: { in: commentIds } }
  return {
    Comment: commentIds.length,
    'Like(post)': await prisma.like.count({ where }),
    'GuestLike(post)': await prisma.guestLike.count({ where }),
    Scrap: await prisma.scrap.count({ where }),
    PostView: await prisma.postView.count({ where }),
    JobDetail: await prisma.jobDetail.count({ where }),
    CpsLink: await prisma.cpsLink.count({ where }),
    'Like(comment)': commentIds.length ? await prisma.like.count({ where: byComment }) : 0,
    'GuestLike(comment)': commentIds.length ? await prisma.guestLike.count({ where: byComment }) : 0,
  }
}

void tag

// `tsx agents/coo/public-content-purge.ts` 로 직접 돌릴 때만 실행한다.
const invokedDirectly = process.argv[1]?.includes('public-content-purge')
if (invokedDirectly) {
  main()
    // 종료 코드로 상태를 구분한다 — `DB_COMPLETE_R2_PENDING` 을 0 으로 끝내면
    // 아무도 이어서 돌리지 않는다.
    .then((state) => process.exit(EXIT_CODE[state]))
    .catch((e) => {
      console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
      process.exit(1)
    })
}
