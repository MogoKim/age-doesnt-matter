// LOCAL ONLY — 공개 시드 글 3건 정합성(2026-09-14). 크론에 연결하지 않는다(수동 전용).
//
// 시드 계정(`seed_NNN`)이 쓴 글이 `source=USER` · `PUBLISHED` 로 남아 **회원 글처럼 보인다.**
// 공개면에서 내리고(`HIDDEN`) 출처를 사실대로(`BOT`) 바꾼다.
//
// 🔴 **Post 와 반응 데이터는 삭제하지 않는다. HomeCurationOverride 2건만 의도적으로 제거한다.**
//    hard delete 도, tombstone(제목·본문 비우기)도 하지 않는다.
//    이 글들에는 **실회원 댓글 2건**이 달려 있다 — 본문을 지우면 그 댓글이 무엇에 대한
//    말이었는지 알 수 없게 된다. 반응 데이터는 한 행도 건드리지 않는다.
//
// 실행:
//   dry-run  npx tsx agents/coo/seed-post-integrity.ts
//   실제     npx tsx agents/coo/seed-post-integrity.ts --execute --confirm=HIDE-SEED-PUBLIC-POSTS-3
//
// 정책: `agents/CLAUDE.md` — DB write 는 COO 만 가능. Raw SQL·REST write 를 쓰지 않는다.
// 🔇 로그: ID·제목·본문·개인정보를 쓰지 않는다. 지문과 집계만 남긴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isSeedAccount, planTargets, checkBaseline, verifyAfter, sha256,
  assertManifestIntegrity, parseManifest, compareReactions, verifyContentUnchanged, totalReports,
  CONFIRM_TOKEN, MANIFEST_PATH, EXPECTED_REACTIONS, EXPECTED_PROVIDER_IDS,
  type Baseline, type AfterCheck, type Issue, type SeedPostRow,
  type ManifestRow, type ReactionCounts,
} from '../purge/seed-post-integrity.js'
import { executeSeedHide, type TransactionRunner } from '../purge/seed-post-integrity-exec.js'
import { isRealMember } from '../purge/public-content-policy.js'
import { extractImageUrls, toObjectKey } from '../purge/r2-objects.js'

export interface Args { execute: boolean; confirm: string | null }

export function parseArgs(argv: readonly string[]): Args {
  const c = argv.find((a) => a.startsWith('--confirm='))
  return { execute: argv.includes('--execute'), confirm: c ? c.slice('--confirm='.length) : null }
}
export function isExecutionAuthorized(a: Args): boolean {
  return a.execute && a.confirm === CONFIRM_TOKEN
}

function out(l: string): void { console.log(l) }
function issuesOut(label: string, issues: readonly Issue[]): void {
  out(`\n  ${label}: ${issues.length}건`)
  for (const i of issues) out(`    - ${i.code} · ${i.detail}`)
}

/**
 * DB 는 지연 로드한다 — `agents/core/db.ts` 는 top-level 에서 연결 URL 을 파싱한다.
 * import 만으로 아무 일도 일어나지 않아야 테스트가 이 파일을 읽을 수 있다.
 */
async function db() { return import('../core/db.js') }
type PrismaLike = Awaited<ReturnType<typeof db>>['prisma']

/** 반응 **12축** 전수 측정. 착수와 사후에 같은 함수를 쓴다. */
async function measureReactions(prisma: PrismaLike, ids: string[]): Promise<ReactionCounts> {
  const w = { postId: { in: ids } }
  const comments = await prisma.comment.findMany({
    where: w, select: { id: true, author: { select: { providerId: true, role: true, status: true } } },
  })
  const cids = comments.map((c) => c.id)
  const cw = { commentId: { in: cids } }
  const postLikes = await prisma.like.findMany({
    where: w, select: { user: { select: { providerId: true, role: true, status: true } } } })
  const commentLikes = cids.length
    ? await prisma.like.findMany({ where: cw, select: { user: { select: { providerId: true, role: true, status: true } } } })
    : []
  const scraps = await prisma.scrap.findMany({
    where: w, select: { user: { select: { providerId: true, role: true, status: true } } } })

  return {
    comments: comments.length,
    realMemberComments: comments.filter((c) => isRealMember(c.author)).length,
    postLikes: postLikes.length,
    realMemberPostLikes: postLikes.filter((l) => isRealMember(l.user)).length,
    commentLikes: commentLikes.length,
    realMemberCommentLikes: commentLikes.filter((l) => isRealMember(l.user)).length,
    guestLikesOnPosts: await prisma.guestLike.count({ where: w }),
    guestLikesOnComments: cids.length ? await prisma.guestLike.count({ where: cw }) : 0,
    scraps: scraps.length,
    realMemberScraps: scraps.filter((s) => isRealMember(s.user)).length,
    postViews: await prisma.postView.count({ where: w }),
    // 🔴 Report 는 글에도 댓글에도 붙는다(postId XOR commentId).
    //    댓글 신고는 postId 가 null 이라 글 기준 조회로는 안 잡힌다 — 두 경로를 합친다.
    reports: totalReports({
      onPosts: await prisma.report.count({ where: w }),
      onComments: cids.length ? await prisma.report.count({ where: cw }) : 0,
    }),
  }
}

/** 착수 조건 실측. read-only 다. */
async function measure(prisma: PrismaLike): Promise<{ base: Baseline; rows: SeedPostRow[]; ids: string[] }> {
  const seedUsers = (await prisma.user.findMany({ select: { id: true, providerId: true } }))
    .filter((u) => isSeedAccount(u.providerId))
  const posts = await prisma.post.findMany({
    where: { authorId: { in: seedUsers.map((u) => u.id) }, status: 'PUBLISHED' },
    select: {
      id: true, boardType: true, status: true, source: true, thumbnailUrl: true, content: true,
      author: { select: { providerId: true } },
    },
  })
  const ids = posts.map((p) => p.id)
  const w = { postId: { in: ids } }

  const comments = await prisma.comment.findMany({
    where: w,
    select: { id: true, author: { select: { providerId: true, role: true, status: true } } },
  })
  const commentIds = comments.map((c) => c.id)
  const likes = await prisma.like.findMany({
    where: w, select: { user: { select: { providerId: true, role: true, status: true } } },
  })

  const boardType: Record<string, number> = {}
  for (const p of posts) boardType[p.boardType] = (boardType[p.boardType] ?? 0) + 1

  const base: Baseline = {
    seedPublishedPosts: posts.length,
    boardType,
    comments: comments.length,
    realMemberComments: comments.filter((c) => isRealMember(c.author)).length,
    postLikes: likes.length,
    realMemberPostLikes: likes.filter((l) => isRealMember(l.user)).length,
    guestLikesOnComments: commentIds.length
      ? await prisma.guestLike.count({ where: { commentId: { in: commentIds } } }) : 0,
    postViews: await prisma.postView.count({ where: w }),
    homeCurationOverrides: await prisma.homeCurationOverride.count({ where: w }),
    postsWithR2Image: posts.filter((p) =>
      extractImageUrls(p.thumbnailUrl, p.content).some((u) => toObjectKey(u) !== null)).length,
  }
  const rows: SeedPostRow[] = posts.map((p) => ({
    id: p.id, boardType: p.boardType, status: p.status, source: p.source,
    providerId: p.author?.providerId ?? null,
  }))
  return { base, rows, ids }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  const authorized = isExecutionAuthorized(args)
  if (args.execute && !authorized) {
    throw new Error(`[ABORT] --confirm 토큰이 없거나 다르다. 필요한 값: ${CONFIRM_TOKEN}`)
  }

  // 🔴 확정 manifest 부터 검증한다 — DB 를 건드리기 전이다.
  const manifestRaw = readFileSync(resolve(process.cwd(), MANIFEST_PATH), 'utf8')
  assertManifestIntegrity(manifestRaw)
  const manifest: ManifestRow[] = parseManifest(manifestRaw)
  const manifestIds = manifest.map((m) => m.id)
  const gotProviders = [...manifest.map((m) => m.providerId)].sort()
  if (JSON.stringify(gotProviders) !== JSON.stringify([...EXPECTED_PROVIDER_IDS].sort())) {
    throw new Error('[ABORT] manifest 의 providerId 3종이 기대와 다르다')
  }

  const { prisma, disconnect } = await db()
  out('━'.repeat(64))
  out(`  [COO] 공개 시드 글 정합성 — ${authorized ? '🔴 실행 모드' : 'dry-run (write 0)'}`)
  out('━'.repeat(64))

  try {
    const { base, rows, ids } = await measure(prisma)
    // 라이브에서 찾은 글이 manifest 와 정확히 같은 집합인지 먼저 본다.
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...manifestIds].sort())) {
      throw new Error('[ABORT] 라이브 대상이 확정 manifest 와 다르다 — mutation 0 으로 중단한다.')
    }
    const reactionsBefore = await measureReactions(prisma, manifestIds)
    out('\n── 착수 실측 ──')
    out(`  PUBLISHED 시드 글       ${base.seedPublishedPosts} (${JSON.stringify(base.boardType)})`)
    out(`  댓글 / 실회원 댓글      ${base.comments} / ${base.realMemberComments}`)
    out(`  Post Like / 실회원      ${base.postLikes} / ${base.realMemberPostLikes}`)
    out(`  GuestLike(comment)      ${base.guestLikesOnComments}`)
    out(`  PostView                ${base.postViews}`)
    out(`  HomeCurationOverride    ${base.homeCurationOverrides}`)
    out(`  R2 이미지 포함 글       ${base.postsWithR2Image}`)
    out('  ── 반응 12축 ──')
    for (const [k, v] of Object.entries(reactionsBefore)) out(`    ${k.padEnd(24)} ${v}`)
    const reactionDrift = Object.entries(EXPECTED_REACTIONS)
      .filter(([k, v]) => reactionsBefore[k as keyof ReactionCounts] !== v)
    if (reactionDrift.length > 0) {
      issuesOut('반응 축 착수값 불일치', reactionDrift.map(([k, v]) =>
        ({ code: 'REACTION_BASELINE', detail: `${k} 기대 ${v} · 실제 ${reactionsBefore[k as keyof ReactionCounts]}` })))
      throw new Error('[ABORT] 반응 착수값이 기대와 다르다 — write 전에 중단한다.')
    }

    const baseIssues = checkBaseline(base)
    if (baseIssues.length > 0) {
      issuesOut('착수 조건 불일치', baseIssues)
      throw new Error('[ABORT] 실측이 기대와 다르다 — write 전에 중단한다.')
    }
    out('\n착수 조건: 기대와 일치 (이슈 0건)')

    const plan = planTargets(rows)
    if (plan.issues.length > 0) {
      issuesOut('대상 판정 이슈', plan.issues)
      throw new Error('[ABORT] 대상 판정 불일치 — mutation 0 상태로 중단한다.')
    }
    out(`대상: ${plan.targets.length}건 · PUBLISHED/USER → HIDDEN/BOT`)

    if (!authorized) {
      out('\n' + '─'.repeat(64))
      out('  dry-run 종료 — DB write 0건')
      out(`  실행: --execute --confirm=${CONFIRM_TOKEN}`)
      out('─'.repeat(64))
      return
    }

    const runner: TransactionRunner = {
      $transaction: (fn, options) => prisma.$transaction(fn as never, options as never) as never,
    }
    const r = await executeSeedHide(runner, {
      manifest,
      expectedCurationDeletes: base.homeCurationOverrides,
    })
    out(`\n── 실제 변경 ──`)
    out(`  Post status·source 갱신   ${r.updated}`)
    out(`  HomeCurationOverride 제거 ${r.curationDeleted}`)

    // ── 사후 검증 ─────────────────────────────────────────────
    const w = { postId: { in: ids } }
    const seedUsers = (await prisma.user.findMany({ select: { id: true, providerId: true } }))
      .filter((u) => isSeedAccount(u.providerId))
    const seedAuthorIds = seedUsers.map((u) => u.id)
    // 관측용 — 판정에 쓰지 않는다(§verifyAfter 주석 참조).
    const statusGroups = await prisma.post.groupBy({ by: ['status'], _count: { _all: true } })
    const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]))

    const after: AfterCheck = {
      // 성공 판정 3축
      seedHiddenBot: await prisma.post.count({
        where: { id: { in: manifestIds }, status: 'HIDDEN', source: 'BOT' } }),
      seedPublishedRemaining: await prisma.post.count({
        where: { authorId: { in: seedAuthorIds }, status: 'PUBLISHED' } }),
      homeCurationOverrides: await prisma.homeCurationOverride.count({ where: w }),
      // 관측값 — 판정에 쓰지 않는다
      totalPosts: await prisma.post.count(),
      publishedTotal: byStatus.PUBLISHED ?? 0,
      hiddenTotal: byStatus.HIDDEN ?? 0,
    }

    const reactionsAfter = await measureReactions(prisma, manifestIds)
    const contentAfter = (await prisma.post.findMany({
      where: { id: { in: manifestIds } }, select: { id: true, title: true, content: true },
    })).map((p) => ({ id: p.id, titleSha256: sha256(p.title), contentSha256: sha256(p.content) }))

    // 판정은 셋이 각자 한 가지만 본다 —
    //   verifyAfter: 성공 정의(HIDDEN/BOT 3 · 공개 0 · 큐레이션 0)
    //   compareReactions: 반응 12축 **감소만** 실패
    //   verifyContentUnchanged: 제목·본문 해시 일치
    const issues = [
      ...verifyAfter(after),
      ...compareReactions(reactionsBefore, reactionsAfter),
      ...verifyContentUnchanged(manifest, contentAfter),
    ]
    if (issues.length > 0) {
      issuesOut('사후 검증 실패', issues)
      throw new Error('[ABORT] 변경은 커밋됐지만 사후 검증을 통과하지 못했다 — done 이라고 말하지 않는다.')
    }
    out('\n── 사후 검증 ──')
    out('  ── 성공 판정 ──')
    out(`  확정 3건 HIDDEN/BOT    ${after.seedHiddenBot}/3`)
    out(`  공개 시드 글 잔량      ${after.seedPublishedRemaining}`)
    out(`  HomeCurationOverride   ${after.homeCurationOverrides}`)
    out('  ── 관측값 (판정에 쓰지 않음) ──')
    out(`  전체 Post              ${after.totalPosts}`)
    out(`  PUBLISHED / HIDDEN     ${after.publishedTotal} / ${after.hiddenTotal}`)
    out('  ── 반응 12축 (감소 0) ──')
    for (const [k, v] of Object.entries(reactionsAfter)) {
      const b = reactionsBefore[k as keyof ReactionCounts]
      out(`    ${k.padEnd(24)} ${b} → ${v}${v > b ? ' (신규 반응)' : ''}`)
    }
    out('  제목·본문 해시: manifest 와 일치')
    out('\n✅ done — 이슈 0건. 캐시 반영은 노출면 검증으로 따로 확인한다.')
  } finally {
    await disconnect()
  }
}


// `tsx agents/coo/seed-post-integrity.ts` 로 직접 돌릴 때만 실행한다.
const invokedDirectly = process.argv[1]?.includes('seed-post-integrity')
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
}
