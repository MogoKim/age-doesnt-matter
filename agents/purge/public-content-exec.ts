/**
 * 영구 삭제 실행 — 단일 트랜잭션.
 *
 * ── 🔴 왜 보호 판정을 여기서 또 하는가 (TOCTOU) ───────────────
 *  preflight 에서 "사람 흔적 없음"을 확인한 뒤 트랜잭션을 열기까지 수십 초가 뜬다.
 *  그 사이 회원이 댓글·좋아요·스크랩을 남길 수 있다. preflight 결과만 믿고 지우면
 *  **방금 참여한 회원의 흔적을 지운다.** 그래서 최종 집합은 **트랜잭션 안에서**
 *  다시 계산한다. 바깥에서 받은 후보는 상한선일 뿐이다.
 *
 * ── 왜 단계가 필요한가 ───────────────────────────────────────
 *  `Post` 를 그냥 지우면 실패한다. schema 실측:
 *    Report(postId·commentId)  onDelete: Restrict          → FK 가 막는다
 *    HomeCurationOverride      onDelete 미지정 = Restrict   → FK 가 막는다
 *  조용히 고아가 남는 것도 있다:
 *    Notification  SetNull · CommentWaveQueue/UserPostWaveQueue  FK 자체가 없음
 *  그래서 막는 것은 먼저 지우고, 고아가 될 것은 명시적으로 지운다.
 *  나머지(Comment·Like·GuestLike·Scrap·PostView·JobDetail·CpsLink)는 CASCADE 가 맡는다.
 */
import {
  TRANSACTION_OPTIONS, EXPECTED_STATUS, isRealMember,
  type PurgeRow, type AuthorLike,
} from './public-content-policy.js'

export class PurgeAbortError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'PurgeAbortError'
  }
}

export interface DeleteManyResult { count: number }
export interface UpdateManyResult { count: number }

/** 트랜잭션 안에서 쓰는 최소 인터페이스. Prisma 클라이언트가 이 모양이다. */
export interface PurgeTx {
  post: {
    findMany(a: { where: unknown; select: unknown }): Promise<Array<{
      id: string; boardType: string; status: string; source: string | null
      authorId: string | null; title: string; content: string; updatedAt: Date
      author: AuthorLike | null
    }>>
    deleteMany(a: { where: unknown }): Promise<DeleteManyResult>
  }
  comment: {
    findMany(a: { where: unknown; select: unknown }): Promise<Array<{
      id: string; postId: string; authorId: string | null; guestNickname: string | null
      author: AuthorLike | null
    }>>
  }
  like: {
    findMany(a: { where: unknown; select: unknown }): Promise<Array<{
      postId: string | null; user: AuthorLike | null
    }>>
    count(a: { where: unknown }): Promise<number>
  }
  guestLike: { count(a: { where: unknown }): Promise<number> }
  scrap: {
    findMany(a: { where: unknown; select: unknown }): Promise<Array<{
      postId: string; user: AuthorLike | null
    }>>
  }
  postView: { count(a: { where: unknown }): Promise<number> }
  jobDetail: { count(a: { where: unknown }): Promise<number> }
  cpsLink: { count(a: { where: unknown }): Promise<number> }
  report: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  homeCurationOverride: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  notification: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  commentWaveQueue: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  userPostWaveQueue: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  user: { updateMany(a: { where: unknown; data: unknown }): Promise<UpdateManyResult> }
  naverBlogQueue: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  socialPost: { updateMany(a: { where: unknown; data: unknown }): Promise<UpdateManyResult> }
  channelDraft: { updateMany(a: { where: unknown; data: unknown }): Promise<UpdateManyResult> }
  voteEvent: { count(a: { where: unknown }): Promise<number> }
  event: { count(a: { where: unknown }): Promise<number> }
}

export interface TransactionOptions { maxWait?: number; timeout?: number }
export interface TransactionRunner {
  $transaction<T>(fn: (tx: PurgeTx) => Promise<T>, options?: TransactionOptions): Promise<T>
}

export interface StepResult { step: string; affected: number }

export interface PurgeOutcome {
  /** 트랜잭션 안에서 최종 확정된 삭제 ID 수 */
  deleted: number
  /** 트랜잭션 안에서 보호 신호가 발견돼 빠진 ID */
  protectedInTx: string[]
  /** 트랜잭션 안에서 확정한 CASCADE 실측 계수 */
  cascade: Record<string, number>
  steps: StepResult[]
}

export interface DeadLinkIds {
  /** linkUrl 안에 삭제 대상 ID 가 박힌 행. 경로 매칭이라 동등 비교로는 못 찾는다. */
  socialPost: string[]
  channelDraft: string[]
}

export interface ExecDeps {
  sha12(value: string): string
  /** 바깥 preflight 가 고른 후보. 트랜잭션 안에서 더 줄어들 수는 있어도 늘지 않는다. */
  candidates: readonly PurgeRow[]
  /** preflight 가 예상한 삭제 건수. 트랜잭션 결과가 이보다 크면 ABORT. */
  expectedMax: number
  /** URL 평문 참조는 호출자가 미리 찾아 준다(경로 매칭). 없으면 정리하지 않는다. */
  deadLinkUrlIds?: DeadLinkIds
}

/**
 * 삭제를 한 트랜잭션으로 실행한다.
 *
 * 반환값의 `deleted` 는 **트랜잭션 안에서 확정된 수**다.
 * 바깥의 preflight 수치와 다를 수 있고, 그건 정상이다(그 사이 회원이 참여한 것).
 * 다만 **늘어나는 것은 비정상**이라 ABORT 한다.
 */
export async function executePurge(db: TransactionRunner, deps: ExecDeps): Promise<PurgeOutcome> {
  const { candidates, sha12, expectedMax } = deps
  if (candidates.length === 0) {
    throw new PurgeAbortError('EMPTY_TARGET', '[ABORT] 삭제 대상이 0건이다 — 실행하지 않는다')
  }
  const want = new Map(candidates.map((c) => [c.id, c]))
  const candidateIds = [...want.keys()]

  return db.$transaction(async (tx) => {
    // ── 1) 트랜잭션 안에서 라이브 상태를 다시 읽는다 ─────────────
    const posts = await tx.post.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true, boardType: true, status: true, source: true, authorId: true,
        title: true, content: true, updatedAt: true,
        author: { select: { providerId: true, role: true } },
      },
    })

    const comments = await tx.comment.findMany({
      where: { postId: { in: candidateIds } },
      select: {
        id: true, postId: true, authorId: true, guestNickname: true,
        author: { select: { providerId: true, role: true } },
      },
    })
    const likes = await tx.like.findMany({
      where: { postId: { in: candidateIds } },
      select: { postId: true, user: { select: { providerId: true, role: true } } },
    })
    const scraps = await tx.scrap.findMany({
      where: { postId: { in: candidateIds } },
      select: { postId: true, user: { select: { providerId: true, role: true } } },
    })

    const realComment = new Set(comments.filter((c) => isRealMember(c.author)).map((c) => c.postId))
    const guestComment = new Set(
      comments.filter((c) => c.authorId === null && c.guestNickname !== null).map((c) => c.postId),
    )
    const realLike = new Set(likes.filter((l) => isRealMember(l.user)).map((l) => l.postId ?? ''))
    const realScrap = new Set(scraps.filter((s) => isRealMember(s.user)).map((s) => s.postId))

    // ── 2) 최종 집합 확정 — 여기서만 결정된다 ────────────────────
    const doomed: string[] = []
    const protectedInTx: string[] = []
    for (const p of posts) {
      const t = want.get(p.id)
      if (!t) continue

      // drift 가 트랜잭션 안에서 보이면 그 자리에서 터뜨린다 — 부분 삭제보다 낫다.
      const drift =
        p.status !== EXPECTED_STATUS ? 'DRIFT_STATUS' :
        p.boardType !== t.boardType ? 'DRIFT_BOARD_TYPE' :
        (p.source ?? '') !== t.source ? 'DRIFT_SOURCE' :
        (p.authorId ? sha12(p.authorId) : '') !== t.authorIdSha256_12 ? 'DRIFT_AUTHOR' :
        sha12(p.title) !== t.titleSha256_12 ? 'DRIFT_TITLE' :
        sha12(p.content) !== t.contentSha256_12 ? 'DRIFT_CONTENT' : null
        // `updatedAt` 은 여기서 보지 않는다 — 카운터 비정규화로 흔들린다(정책 모듈 주석 참조).
        // 실제 편집은 바로 위 제목·본문 해시가 잡는다.
      if (drift) {
        throw new PurgeAbortError(drift, `[ABORT] 트랜잭션 안에서 ${drift} 를 발견했다 — 되돌린다`)
      }

      const isProtected =
        isRealMember(p.author) || realComment.has(p.id) || guestComment.has(p.id) ||
        realLike.has(p.id) || realScrap.has(p.id)
      if (isProtected) protectedInTx.push(p.id)
      else doomed.push(p.id)
    }

    if (doomed.length === 0) {
      throw new PurgeAbortError('ALL_PROTECTED', '[ABORT] 전건이 보호 대상이 됐다 — 지울 것이 없다')
    }
    if (doomed.length > expectedMax) {
      throw new PurgeAbortError(
        'TARGET_GREW',
        `[ABORT] 트랜잭션 안 대상 ${doomed.length} > preflight ${expectedMax} — 늘어날 수 없다`,
      )
    }

    // ── 3) CASCADE 실측 계수도 트랜잭션 안에서 확정한다 ──────────
    const byPost = { postId: { in: doomed } }
    const doomedComments = comments.filter((c) => doomed.includes(c.postId)).map((c) => c.id)
    const byComment = { commentId: { in: doomedComments } }

    const cascade: Record<string, number> = {
      Comment: doomedComments.length,
      'Like(post)': likes.filter((l) => l.postId !== null && doomed.includes(l.postId)).length,
      'Scrap': scraps.filter((s) => doomed.includes(s.postId)).length,
      'GuestLike(post)': await tx.guestLike.count({ where: byPost }),
      PostView: await tx.postView.count({ where: byPost }),
      JobDetail: await tx.jobDetail.count({ where: byPost }),
      CpsLink: await tx.cpsLink.count({ where: byPost }),
      'Like(comment)': doomedComments.length ? await tx.like.count({ where: byComment }) : 0,
      'GuestLike(comment)': doomedComments.length ? await tx.guestLike.count({ where: byComment }) : 0,
    }

    // ── 4) 살아 있는 semantic 참조가 있으면 여기서 멈춘다 ────────
    const activeVote = await tx.voteEvent.count({ where: { linkedPostId: { in: doomed } } })
    if (activeVote > 0) {
      throw new PurgeAbortError('ACTIVE_SEMANTIC_REF', `[ABORT] VoteEvent.linkedPostId 가 ${activeVote}건 살아 있다`)
    }
    const activeEvent = await tx.event.count({ where: { bodyPostId: { in: doomed } } })
    if (activeEvent > 0) {
      throw new PurgeAbortError('ACTIVE_SEMANTIC_REF', `[ABORT] Event.bodyPostId 가 ${activeEvent}건 살아 있다`)
    }

    // ── 5) Restrict 해제 → 고아 제거 → 평문 참조 정리 → 본체 ────
    const steps: StepResult[] = []
    const step = async (name: string, run: () => Promise<{ count: number }>) => {
      const r = await run()
      steps.push({ step: name, affected: r.count })
      return r.count
    }

    if (doomedComments.length) {
      await step('Report(comment)', () => tx.report.deleteMany({ where: byComment }))
    } else {
      steps.push({ step: 'Report(comment)', affected: 0 })
    }
    await step('Report(post)', () => tx.report.deleteMany({ where: byPost }))
    await step('HomeCurationOverride', () => tx.homeCurationOverride.deleteMany({ where: byPost }))
    await step('Notification', () => tx.notification.deleteMany({ where: byPost }))
    await step('CommentWaveQueue', () => tx.commentWaveQueue.deleteMany({ where: byPost }))
    await step('UserPostWaveQueue', () => tx.userPostWaveQueue.deleteMany({ where: byPost }))

    // 평문 참조 — CLEANUP 정책. 감사 로그(AdminAuditLog)는 손대지 않는다.
    await step('User.firstGreetingPostId→null', () =>
      tx.user.updateMany({ where: { firstGreetingPostId: { in: doomed } }, data: { firstGreetingPostId: null } }))
    await step('NaverBlogQueue(dead)', () =>
      tx.naverBlogQueue.deleteMany({ where: { magazinePostId: { in: doomed } } }))
    await step('SocialPost.sourcePostId→null', () =>
      tx.socialPost.updateMany({ where: { sourcePostId: { in: doomed } }, data: { sourcePostId: null } }))

    // linkUrl 은 ID 가 경로 안에 박혀 있어 동등 비교가 안 된다 — 호출자가 찾아 준 행만 지운다.
    const deadLinkIds = deps.deadLinkUrlIds ?? { socialPost: [], channelDraft: [] }
    await step('SocialPost.linkUrl→null', () =>
      deadLinkIds.socialPost.length
        ? tx.socialPost.updateMany({ where: { id: { in: deadLinkIds.socialPost } }, data: { linkUrl: null } })
        : Promise.resolve({ count: 0 }))
    await step('ChannelDraft.linkUrl→null', () =>
      deadLinkIds.channelDraft.length
        ? tx.channelDraft.updateMany({ where: { id: { in: deadLinkIds.channelDraft } }, data: { linkUrl: null } })
        : Promise.resolve({ count: 0 }))

    const deleted = await step('Post', () =>
      tx.post.deleteMany({ where: { id: { in: doomed }, status: EXPECTED_STATUS } }))
    if (deleted !== doomed.length) {
      throw new PurgeAbortError(
        'AFFECTED_MISMATCH',
        `[ABORT] Post 영향 행 ${deleted} ≠ 확정 대상 ${doomed.length} — 되돌린다`,
      )
    }

    return { deleted, protectedInTx, cascade, steps }
  }, { ...TRANSACTION_OPTIONS })
}
