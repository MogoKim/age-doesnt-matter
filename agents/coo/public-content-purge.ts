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
  classifyRunState, blockingSemanticIssues, verifyAfterPurge, isRealMember, sha12, tag,
  CONFIRM_TOKEN, EXPECTED_TOTAL, EXPECTED_PRESERVE_TOTAL, R2_MANIFEST_KEYS, SEMANTIC_REFS,
  type PurgeRow, type LiveRow, type PlanIssue, type SemanticCount,
} from '../purge/public-content-policy.js'
import { planR2Deletion, type PostImageSource, type ForeignImageSource } from '../purge/r2-objects.js'
import { executePurge, PurgeAbortError, type TransactionRunner } from '../purge/public-content-exec.js'
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

/** URL 안에 대상 ID 가 박힌 행을 찾는다. 경로 매칭이라 동등 비교로는 못 찾는다. */
export function findDeadLinkRows(
  rows: readonly { id: string; linkUrl: string | null }[],
  doomed: ReadonlySet<string>,
): string[] {
  return rows
    .filter((r) => r.linkUrl !== null && [...doomed].some((id) => r.linkUrl!.includes(id)))
    .map((r) => r.id)
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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
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
        title: true, content: true, updatedAt: true, thumbnailUrl: true,
        author: { select: { providerId: true, role: true } },
      },
    })
    const state = classifyRunState(EXPECTED_TOTAL, posts.length)
    out(`\n재실행 판정: ${state} (남은 후보 ${posts.length}/${EXPECTED_TOTAL})`)

    const preserveBefore = await prisma.post.count({ where: { id: { in: keep } } })
    if (preserveBefore !== keep.length) {
      throw new Error(`[ABORT] 보존 대상이 이미 줄었다 — ${preserveBefore}/${keep.length}`)
    }

    // R2 는 DB 와 독립이다. DB 가 COMPLETE 여도 남은 이미지 정리를 이어갈 수 있다.
    const runR2 = async (sharedKeys: ReadonlySet<string>): Promise<void> => {
      const cfg = r2ConfigFromEnv()
      if (!authorized) {
        out(`\n── R2 (dry-run) ── manifest ${manifestKeys.length}키 · 공유 제외 ${sharedKeys.size} · 삭제 0`)
        return
      }
      if (!cfg) { out('\n── R2 ── 자격증명이 없다 — 이미지 정리를 건너뛴다(DB 결과는 유효하다)'); return }
      const s = await runR2Cleanup(fetch as unknown as FetchLike, cfg, manifestKeys, sharedKeys)
      out(`\n── R2 ── 삭제 ${s.deleted} · 이미 없음 ${s.alreadyGone} · 공유 제외 ${s.sharedSkipped} · 불확실 ${s.uncertain} · 잔존 ${s.remaining}`)
    }

    // 공유 키는 DB 상태와 무관하게 매번 다시 계산한다.
    const survivors: PostImageSource[] = await prisma.post.findMany({
      where: { id: { notIn: ids } },
      select: { id: true, thumbnailUrl: true, content: true },
    })
    const foreign: ForeignImageSource[] = [
      { model: 'SocialPost', urls: (await prisma.socialPost.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
      { model: 'ChannelDraft', urls: (await prisma.channelDraft.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
      { model: 'NaverBlogQueue', urls: (await prisma.naverBlogQueue.findMany({ select: { imageUrls: true } })).flatMap((r) => r.imageUrls) },
      { model: 'Banner', urls: (await prisma.banner.findMany({ select: { imageUrl: true } })).map((b) => b.imageUrl).filter((u): u is string => !!u) },
    ]
    const doomedImgs: PostImageSource[] = posts.map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl, content: p.content }))
    const r2plan = planR2Deletion(doomedImgs, survivors, foreign)
    const sharedKeys = new Set(r2plan.shared)
    out(`\n── R2 계획 ── 전용 ${r2plan.exclusive.length} · 공유(삭제 금지) ${r2plan.shared.length} · 외부 ${r2plan.external.length}`)

    if (args.r2Only || state === 'COMPLETE') {
      if (state === 'COMPLETE') out('\nDB 는 이미 COMPLETE — 남은 R2 정리만 이어간다.')
      await runR2(sharedKeys)
      return
    }
    if (state === 'PARTIAL') {
      throw new Error('[ABORT] 후보가 일부만 남아 있다 — 자동으로 이어서 지우지 않는다. 사람이 확인해야 한다.')
    }

    // ── 보호 신호 preflight ────────────────────────────────────
    const comments = await prisma.comment.findMany({
      where: { postId: { in: ids } },
      select: { postId: true, authorId: true, guestNickname: true, author: { select: { providerId: true, role: true } } },
    })
    const likes = await prisma.like.findMany({
      where: { postId: { in: ids } }, select: { postId: true, user: { select: { providerId: true, role: true } } },
    })
    const scraps = await prisma.scrap.findMany({
      where: { postId: { in: ids } }, select: { postId: true, user: { select: { providerId: true, role: true } } },
    })
    const realComment = new Set(comments.filter((c) => isRealMember(c.author)).map((c) => c.postId))
    const guestComment = new Set(comments.filter((c) => c.authorId === null && c.guestNickname !== null).map((c) => c.postId))
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

    // ── semantic 평문 참조 ─────────────────────────────────────
    const socialRows = await prisma.socialPost.findMany({ select: { id: true, linkUrl: true } })
    const draftRows = await prisma.channelDraft.findMany({ select: { id: true, linkUrl: true } })
    const deadSocial = findDeadLinkRows(socialRows, doomedSet)
    const deadDraft = findDeadLinkRows(draftRows, doomedSet)

    const semantic: SemanticCount[] = [
      { model: 'VoteEvent', field: 'linkedPostId', count: await prisma.voteEvent.count({ where: { linkedPostId: { in: [...doomedSet] } } }) },
      { model: 'Event', field: 'bodyPostId', count: await prisma.event.count({ where: { bodyPostId: { in: [...doomedSet] } } }) },
      { model: 'User', field: 'firstGreetingPostId', count: await prisma.user.count({ where: { firstGreetingPostId: { in: [...doomedSet] } } }) },
      { model: 'NaverBlogQueue', field: 'magazinePostId', count: await prisma.naverBlogQueue.count({ where: { magazinePostId: { in: [...doomedSet] } } }) },
      { model: 'SocialPost', field: 'sourcePostId', count: await prisma.socialPost.count({ where: { sourcePostId: { in: [...doomedSet] } } }) },
      { model: 'SocialPost', field: 'linkUrl', count: deadSocial.length },
      { model: 'ChannelDraft', field: 'linkUrl', count: deadDraft.length },
      { model: 'AdminAuditLog', field: 'targetId', count: await prisma.adminAuditLog.count({ where: { targetId: { in: [...doomedSet] } } }) },
    ]
    out('\n── semantic 평문 참조 ──')
    const policyOf = new Map(SEMANTIC_REFS.map((r) => [`${r.model}.${r.field}`, r.policy]))
    for (const s of semantic) out(`  ${`${s.model}.${s.field}`.padEnd(32)} ${String(s.count).padStart(4)}  ${policyOf.get(`${s.model}.${s.field}`)}`)

    const blocking = blockingSemanticIssues(semantic)
    if (blocking.length > 0) {
      issuesOut('살아 있는 참조', blocking)
      throw new Error('[ABORT] 활성 이벤트/투표가 대상 글을 가리킨다 — mutation 0 으로 중단한다.')
    }

    if (!authorized) {
      await runR2(sharedKeys)
      out('\n' + '─'.repeat(66))
      out('  dry-run 종료 — DB write 0건 · R2 삭제 0건')
      out('─'.repeat(66))
      return
    }

    // ── 실행 ──────────────────────────────────────────────────
    const before = await tableCounts(prisma, [...doomedSet])
    const runner: TransactionRunner = {
      $transaction: (fn, options) => prisma.$transaction(fn as never, options) as never,
    }
    const result = await executePurge(runner, {
      sha12,
      candidates: rows.filter((r) => doomedSet.has(r.id)),
      expectedMax: doomedSet.size,
      deadLinkUrlIds: { socialPost: deadSocial, channelDraft: deadDraft },
    })
    out('\n── 실제 삭제 ──')
    for (const s of result.steps) out(`  ${s.step.padEnd(30)} ${s.affected}`)
    out(`  트랜잭션 내 보호 제외: ${result.protectedInTx.length}건`)

    // ── 사후 검증 — 통과해야만 done 을 말한다 ───────────────────
    const after = await tableCounts(prisma, [...doomedSet])
    const residual: SemanticCount[] = [
      { model: 'User', field: 'firstGreetingPostId', count: await prisma.user.count({ where: { firstGreetingPostId: { in: [...doomedSet] } } }) },
      { model: 'NaverBlogQueue', field: 'magazinePostId', count: await prisma.naverBlogQueue.count({ where: { magazinePostId: { in: [...doomedSet] } } }) },
      { model: 'SocialPost', field: 'sourcePostId', count: await prisma.socialPost.count({ where: { sourcePostId: { in: [...doomedSet] } } }) },
      { model: 'AdminAuditLog', field: 'targetId', count: await prisma.adminAuditLog.count({ where: { targetId: { in: [...doomedSet] } } }) },
    ]
    const protectedIds = [...drift.protectedExclusions, ...result.protectedInTx]
    const check = verifyAfterPurge({
      targetsRemaining: await prisma.post.count({ where: { id: { in: [...doomedSet] } } }),
      preserveBefore,
      preserveAfter: await prisma.post.count({ where: { id: { in: keep } } }),
      protectedExpected: protectedIds.length,
      protectedRemaining: protectedIds.length ? await prisma.post.count({ where: { id: { in: protectedIds } } }) : 0,
      semanticResidual: residual,
      tableDeltas: Object.keys(before).map((t) => ({ table: t, expected: result.cascade[t] ?? 0, actual: before[t] - after[t] })),
    })
    if (check.length > 0) {
      issuesOut('사후 검증 실패', check)
      throw new Error('[ABORT] 삭제는 커밋됐지만 사후 검증을 통과하지 못했다 — done 이라고 말하지 않는다.')
    }
    out('\n사후 검증: 이슈 0건')

    await runR2(sharedKeys)
    out('\n✅ done — DB 삭제 · 사후 검증 · R2 정리까지 마쳤다.')
  } finally {
    await disconnect()
  }
}

/** CASCADE 실제 감소량을 재기 위한 스냅샷. */
type PrismaLike = Awaited<ReturnType<typeof db>>['prisma']
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
void PurgeAbortError

// `tsx agents/coo/public-content-purge.ts` 로 직접 돌릴 때만 실행한다.
const invokedDirectly = process.argv[1]?.includes('public-content-purge')
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
}
