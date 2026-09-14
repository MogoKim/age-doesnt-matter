// LOCAL ONLY — 공개 시드 글 3건 정합성(2026-09-14). 크론에 연결하지 않는다(수동 전용).
//
// 시드 계정(`seed_NNN`)이 쓴 글이 `source=USER` · `PUBLISHED` 로 남아 **회원 글처럼 보인다.**
// 공개면에서 내리고(`HIDDEN`) 출처를 사실대로(`BOT`) 바꾼다.
//
// 🔴 **지우는 작업이 아니다.** hard delete 도, tombstone(제목·본문 비우기)도 하지 않는다.
//    이 글들에는 **실회원 댓글 2건**이 달려 있다 — 본문을 지우면 그 댓글이 무엇에 대한
//    말이었는지 알 수 없게 된다. 반응 데이터는 한 행도 건드리지 않는다.
//
// 실행:
//   dry-run  npx tsx agents/coo/seed-post-integrity.ts
//   실제     npx tsx agents/coo/seed-post-integrity.ts --execute --confirm=HIDE-SEED-PUBLIC-POSTS-3
//
// 정책: `agents/CLAUDE.md` — DB write 는 COO 만 가능. Raw SQL·REST write 를 쓰지 않는다.
// 🔇 로그: ID·제목·본문·개인정보를 쓰지 않는다. 지문과 집계만 남긴다.
import {
  isSeedAccount, planTargets, checkBaseline, verifyAfter,
  CONFIRM_TOKEN, EXPECTED_BASELINE,
  type Baseline, type AfterCheck, type Issue, type SeedPostRow,
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

  const { prisma, disconnect } = await db()
  out('━'.repeat(64))
  out(`  [COO] 공개 시드 글 정합성 — ${authorized ? '🔴 실행 모드' : 'dry-run (write 0)'}`)
  out('━'.repeat(64))

  try {
    const { base, rows, ids } = await measure(prisma)
    out('\n── 착수 실측 ──')
    out(`  PUBLISHED 시드 글       ${base.seedPublishedPosts} (${JSON.stringify(base.boardType)})`)
    out(`  댓글 / 실회원 댓글      ${base.comments} / ${base.realMemberComments}`)
    out(`  Post Like / 실회원      ${base.postLikes} / ${base.realMemberPostLikes}`)
    out(`  GuestLike(comment)      ${base.guestLikesOnComments}`)
    out(`  PostView                ${base.postViews}`)
    out(`  HomeCurationOverride    ${base.homeCurationOverrides}`)
    out(`  R2 이미지 포함 글       ${base.postsWithR2Image}`)

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
      targets: plan.targets,
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
    const comments = await prisma.comment.findMany({
      where: w, select: { id: true, author: { select: { providerId: true, role: true, status: true } } },
    })
    const commentIds = comments.map((c) => c.id)
    const statusGroups = await prisma.post.groupBy({ by: ['status'], _count: { _all: true } })
    const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]))
    const changed = await prisma.post.findMany({
      where: { id: { in: ids } }, select: { title: true, content: true },
    })

    const after: AfterCheck = {
      seedPublishedRemaining: await prisma.post.count({
        where: { authorId: { in: seedAuthorIds }, status: 'PUBLISHED' } }),
      seedHiddenBot: await prisma.post.count({
        where: { id: { in: ids }, status: 'HIDDEN', source: 'BOT' } }),
      totalPosts: await prisma.post.count(),
      publishedTotal: byStatus.PUBLISHED ?? 0,
      hiddenTotal: byStatus.HIDDEN ?? 0,
      comments: comments.length,
      realMemberComments: comments.filter((c) => isRealMember(c.author)).length,
      postLikes: await prisma.like.count({ where: w }),
      guestLikesOnComments: commentIds.length
        ? await prisma.guestLike.count({ where: { commentId: { in: commentIds } } }) : 0,
      postViews: await prisma.postView.count({ where: w }),
      homeCurationOverrides: await prisma.homeCurationOverride.count({ where: w }),
      postsWithEmptyTitleOrContent: changed.filter((p) => p.title.trim() === '' || p.content.trim() === '').length,
    }
    const issues = verifyAfter(after, base)
    if (issues.length > 0) {
      issuesOut('사후 검증 실패', issues)
      throw new Error('[ABORT] 변경은 커밋됐지만 사후 검증을 통과하지 못했다 — done 이라고 말하지 않는다.')
    }
    out('\n── 사후 검증 ──')
    out(`  공개 시드 글 잔량      ${after.seedPublishedRemaining}`)
    out(`  HIDDEN/BOT             ${after.seedHiddenBot}`)
    out(`  전체 Post              ${after.totalPosts} (불변)`)
    out(`  PUBLISHED / HIDDEN     ${after.publishedTotal} / ${after.hiddenTotal}`)
    out(`  댓글 / 실회원 댓글     ${after.comments} / ${after.realMemberComments} (보존)`)
    out(`  Like / GuestLike / View ${after.postLikes} / ${after.guestLikesOnComments} / ${after.postViews} (보존)`)
    out('\n✅ done — 이슈 0건. 캐시 반영은 노출면 검증으로 따로 확인한다.')
  } finally {
    await disconnect()
  }
}

void EXPECTED_BASELINE

// `tsx agents/coo/seed-post-integrity.ts` 로 직접 돌릴 때만 실행한다.
const invokedDirectly = process.argv[1]?.includes('seed-post-integrity')
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
}
