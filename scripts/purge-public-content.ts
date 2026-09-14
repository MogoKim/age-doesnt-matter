/**
 * 공개 콘텐츠 628건 **영구 삭제** CLI.
 *
 * ─────────────────────────────────────────────────────────────
 *  기본 동작은 dry-run 이고 write 는 0건이다.
 *  🔴 이 도구에는 **롤백이 없다.** hard delete 는 되돌릴 수 없다.
 * ─────────────────────────────────────────────────────────────
 *
 *   # 미리보기 (write 0)
 *   npx tsx scripts/purge-public-content.ts
 *
 *   # 실제 삭제 — COO 주체 · --execute · 확인 토큰이 **모두** 있어야 한다
 *   PURGE_AGENT_ID=coo:content-purge \
 *     npx tsx scripts/purge-public-content.ts --execute --confirm=PURGE-PUBLIC-CONTENT-628
 *
 *   # 이미지까지 지우려면 R2 자격증명이 있어야 한다(없으면 DB 만 지우고 이미지는 보고만).
 *
 * 정책
 *  - Raw SQL·REST write 를 쓰지 않는다. Prisma 트랜잭션만 쓴다.
 *  - `agents/CLAUDE.md`: DB write 는 COO 만 가능 → `PURGE_AGENT_ID` 가 `coo:` 여야 열린다.
 *  - 크론·워크플로·에이전트 런타임에서 부르지 않는다. 승인 후 사람이 한 번 돌리는 도구다.
 *
 * 🔇 로그: ID·제목·본문·개인정보를 쓰지 않는다. 해시 지문과 집계만 남긴다.
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  parseCsv, toPurgeRows, buildPlan, detectDrift, assertCsvIntegrity,
  assertCooWriteAuthority, classifyRunState, sha256,
  CONFIRM_TOKEN, EXPECTED_TOTAL, EXPECTED_PRESERVE_TOTAL,
  type PurgeRow, type LiveRow, type PlanIssue,
} from '../src/lib/purge/public-content-plan'
import { planR2Deletion, type PostImageSource } from '../src/lib/purge/r2-keys'
import {
  executePurge, PurgeAbortError, type TransactionRunner, type ExpectedCounts,
} from '../src/lib/purge/public-content-exec'

const CSV_PATH = 'docs/operations/data/2026-09-14-public-content-purge.csv'
const TIER1_CSV = 'docs/operations/data/2026-09-11-public-content-disposition.csv'
const TIER2_CSV = 'docs/operations/data/2026-09-11-review-tier2.csv'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valueOf = (f: string) => argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1)

const wantExecute = has('--execute')
const confirm = valueOf('--confirm') ?? null

function die(msg: string): never {
  console.error(`\n${msg}\n`)
  process.exit(2)
}
function issuesOut(label: string, issues: PlanIssue[]): void {
  console.log(`\n  ${label}: ${issues.length}건`)
  for (const i of issues.slice(0, 20)) console.log(`    - ${i.code} · ${i.detail}`)
  if (issues.length > 20) console.log(`    … 외 ${issues.length - 20}건`)
}

/** 보존 경계를 역사적 CSV 두 장에서 다시 만든다 — 코드에 ID 를 박지 않는다. */
function preserveIds(): string[] {
  const t1 = parseCsv(readFileSync(resolve(process.cwd(), TIER1_CSV), 'utf8'))
  const t2 = parseCsv(readFileSync(resolve(process.cwd(), TIER2_CSV), 'utf8'))
  const col = (head: string[], name: string) => head.indexOf(name)
  const keep = new Set<string>()

  const [h1, ...b1] = t1
  const v1 = col(h1, 'verdict'); const i1 = col(h1, 'id')
  for (const r of b1) if (r[v1] === 'PRESERVE') keep.add(r[i1])

  const [h2, ...b2] = t2
  const a2 = col(h2, 'recommendedAction'); const i2 = col(h2, 'id')
  const p2 = col(h2, 'protectedFromHideDelete')
  const KEEP2 = new Set(['PRESERVE', 'REWRITE_AUTO_COMPOSED', 'REWRITE_BRAND_COPY'])
  for (const r of b2) if (KEEP2.has(r[a2]) || r[p2] === 'true') keep.add(r[i2])

  return [...keep]
}

const isRealMember = (a: { providerId: string; role: string } | null): boolean =>
  !!a && /^\d+$/.test(a.providerId) && a.role !== 'ADMIN'

async function main(): Promise<void> {
  console.log('━'.repeat(66))
  console.log('  공개 콘텐츠 영구 삭제 — ' + (wantExecute ? '🔴 실행 모드' : 'dry-run (write 0)'))
  console.log('━'.repeat(66))

  // 1) 확정 CSV 무결성 — 변조됐으면 DB 를 건드리기 전에 멈춘다.
  const raw = readFileSync(resolve(process.cwd(), CSV_PATH), 'utf8')
  assertCsvIntegrity(raw)
  const rows: PurgeRow[] = toPurgeRows(parseCsv(raw))
  console.log(`\n확정 CSV 검증 통과 · ${rows.length}행`)

  // 2) CSV 정합성 + 보존 경계 교집합
  const keep = preserveIds()
  const plan = buildPlan(rows, keep)
  console.log(`보존 경계: ${keep.length}건 (기대 ${EXPECTED_PRESERVE_TOTAL})`)
  if (plan.issues.length > 0) {
    issuesOut('계획 이슈', plan.issues)
    die('[ABORT] 계획 단계에서 불일치 — mutation 0 상태로 중단한다.')
  }
  console.log('계획 이슈: 0건')

  // 3) write 권한은 조회 전에 판정한다 — 자격 없는 실행은 읽지도 않는다.
  if (wantExecute) {
    if (confirm !== CONFIRM_TOKEN) {
      die(`[ABORT] --confirm 토큰이 없거나 다르다. 필요한 값: ${CONFIRM_TOKEN}`)
    }
    try {
      assertCooWriteAuthority({
        agentId: (process.env.PURGE_AGENT_ID ?? '').trim(),
        canWrite: (process.env.PURGE_AGENT_CAN_WRITE ?? 'true').trim() === 'true',
      })
    } catch (e) {
      die(e instanceof Error ? e.message : String(e))
    }
    console.log(`write 주체: ${process.env.PURGE_AGENT_ID} (COO 경로 확인)`)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) die('[ABORT] DATABASE_URL 이 없다.')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const ids = rows.map((r) => r.id)

    // 4) 라이브 스냅샷 + 보호 신호
    const posts = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, boardType: true, status: true, title: true, thumbnailUrl: true, content: true,
        author: { select: { providerId: true, role: true } },
      },
    })
    const comments = await prisma.comment.findMany({
      where: { postId: { in: ids } },
      select: { postId: true, authorId: true, guestNickname: true,
                author: { select: { providerId: true, role: true } } },
    })
    const realCommentPosts = new Set(comments.filter((c) => isRealMember(c.author)).map((c) => c.postId))
    const guestCommentPosts = new Set(
      comments.filter((c) => c.authorId === null && c.guestNickname !== null).map((c) => c.postId),
    )

    const live: LiveRow[] = posts.map((p) => ({
      id: p.id,
      boardType: p.boardType,
      status: p.status,
      titleSha256_12: sha256(p.title).slice(0, 12),
      hasRealAuthor: isRealMember(p.author),
      hasRealComment: realCommentPosts.has(p.id),
      hasGuestComment: guestCommentPosts.has(p.id),
    }))

    // 5) 재실행 안전 판정
    const state = classifyRunState(EXPECTED_TOTAL, posts.length)
    console.log(`\n재실행 판정: ${state} (남은 후보 ${posts.length}/${EXPECTED_TOTAL})`)
    if (state === 'COMPLETE') {
      console.log('\n이미 완료된 상태다. 할 일이 없다.')
      return
    }
    if (state === 'PARTIAL') {
      die('[ABORT] 일부만 남아 있다 — 자동으로 이어서 지우지 않는다. 사람이 확인해야 한다.')
    }

    // 6) drift
    const drift = detectDrift(rows, live)
    if (drift.issues.length > 0) {
      issuesOut('drift 이슈', drift.issues)
      die('[ABORT] 실행 직전 불일치 — mutation 0 상태로 중단한다.')
    }
    console.log('drift 이슈: 0건')

    const doomed = new Set(drift.deletable)
    console.log(`\n삭제 대상 ${doomed.size}건 · 보호 신호 자동 제외 ${drift.protectedExclusions.length}건`)
    const bt: Record<string, number> = {}
    for (const p of posts) if (doomed.has(p.id)) bt[p.boardType] = (bt[p.boardType] ?? 0) + 1
    console.log('boardType 분해:', bt)

    // 7) 의존 테이블 exact count
    const where = { postId: { in: [...doomed] } }
    const doomedCommentIds = (
      await prisma.comment.findMany({ where, select: { id: true } })
    ).map((c) => c.id)

    const counts = {
      Comment: doomedCommentIds.length,
      PostView: await prisma.postView.count({ where }),
      JobDetail: await prisma.jobDetail.count({ where }),
      CpsLink: await prisma.cpsLink.count({ where }),
      Scrap: await prisma.scrap.count({ where }),
      'Like(post)': await prisma.like.count({ where }),
      'GuestLike(post)': await prisma.guestLike.count({ where }),
      'Like(comment)': doomedCommentIds.length
        ? await prisma.like.count({ where: { commentId: { in: doomedCommentIds } } }) : 0,
      'GuestLike(comment)': doomedCommentIds.length
        ? await prisma.guestLike.count({ where: { commentId: { in: doomedCommentIds } } }) : 0,
      'Report(post)': await prisma.report.count({ where }),
      'Report(comment)': doomedCommentIds.length
        ? await prisma.report.count({ where: { commentId: { in: doomedCommentIds } } }) : 0,
      Notification: await prisma.notification.count({ where }),
      HomeCurationOverride: await prisma.homeCurationOverride.count({ where }),
      CommentWaveQueue: await prisma.commentWaveQueue.count({ where }),
      UserPostWaveQueue: await prisma.userPostWaveQueue.count({ where }),
    }
    console.log('\n── 의존 테이블 예상 삭제량 ──')
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${v}`)

    // 8) R2 — 남는 글 **전부**와 대조해야 공유를 놓치지 않는다.
    const survivors: PostImageSource[] = (
      await prisma.post.findMany({
        where: { id: { notIn: [...doomed] } },
        select: { id: true, thumbnailUrl: true, content: true },
      })
    )
    const doomedImgs: PostImageSource[] = posts
      .filter((p) => doomed.has(p.id))
      .map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl, content: p.content }))
    const r2 = planR2Deletion(doomedImgs, survivors)
    console.log('\n── R2 이미지 ──')
    console.log(`  삭제 대상(전용)   ${r2.exclusive.length}`)
    console.log(`  공유 — 삭제 금지  ${r2.shared.length}`)
    console.log(`  외부 — 손대지 않음 ${r2.external.length}`)

    // 9) 보존 대상 전후 대조용 기준선
    const keepLive = await prisma.post.count({ where: { id: { in: keep } } })
    console.log(`\n보존 대상 현재 잔량: ${keepLive}/${keep.length}`)
    if (keepLive !== keep.length) die('[ABORT] 보존 대상이 이미 줄었다 — 중단한다.')

    if (!wantExecute) {
      console.log('\n' + '─'.repeat(66))
      console.log('  dry-run 종료 — DB write 0건 · R2 삭제 0건')
      console.log('  실제 삭제는 COO 주체 + --execute + 확인 토큰이 모두 있어야 한다.')
      console.log('─'.repeat(66))
      return
    }

    // 10) 실행
    const expected: ExpectedCounts = {
      reportOnComment: counts['Report(comment)'],
      reportOnPost: counts['Report(post)'],
      homeCurationOverride: counts.HomeCurationOverride,
      notification: counts.Notification,
      commentWaveQueue: counts.CommentWaveQueue,
      userPostWaveQueue: counts.UserPostWaveQueue,
      post: doomed.size,
    }
    const runner: TransactionRunner = {
      $transaction: (fn, options) =>
        prisma.$transaction(fn as never, options) as never,
    }
    const steps = await executePurge(runner, [...doomed], expected, [...new Set(Object.keys(bt))])
    console.log('\n── 실제 삭제 ──')
    for (const s of steps) console.log(`  ${s.step.padEnd(22)} ${s.affected} (기대 ${s.expected})`)
    console.log('\n✅ DB 삭제 커밋 완료. R2 정리는 별도 단계다.')
  } catch (e) {
    if (e instanceof PurgeAbortError) die(e.message)
    throw e
  } finally {
    await prisma.$disconnect()
  }
}

/** import 만으로는 아무것도 하지 않는다. */
export const isDirectRun = (): boolean =>
  Boolean(process.argv[1]?.includes('purge-public-content'))

if (isDirectRun()) {
  main().catch((e) => {
    console.error(`\n[ABORT] ${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
}
