/**
 * 영구 삭제 실행 — 단일 트랜잭션, 단계별 영향 행 대조.
 *
 * ── 왜 단계가 필요한가 ───────────────────────────────────────
 *  `Post` 를 그냥 지우면 **실패한다.** schema 실측:
 *    Report(postId·commentId)  onDelete: Restrict  → FK 가 막는다
 *    HomeCurationOverride      onDelete 미지정 = Restrict → FK 가 막는다
 *  그리고 조용히 **고아가 남는 것**도 있다:
 *    Notification              onDelete: SetNull  → 행은 살고 postId 만 null
 *    CommentWaveQueue          FK 자체가 없음(평문 String)
 *    UserPostWaveQueue         FK 자체가 없음(평문 String)
 *  그래서 막는 것은 **먼저 지우고**, 고아가 될 것은 **명시적으로 지운다**.
 *  나머지(Comment·Like·GuestLike·Scrap·PostView·JobDetail·CpsLink)는 CASCADE 가 맡는다.
 *
 * ── 안전장치 ─────────────────────────────────────────────────
 *  단계마다 실제 영향 행 수를 기대값과 대조한다. 하나라도 다르면 던지고,
 *  트랜잭션이 통째로 롤백된다. **부분 삭제 상태로 끝나지 않는다.**
 */
import { TRANSACTION_OPTIONS } from './public-content-plan'

export class PurgeAbortError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'PurgeAbortError'
  }
}

export interface DeleteManyResult { count: number }

/** 트랜잭션 안에서 쓸 수 있는 최소 인터페이스. Prisma 클라이언트가 이 모양이다. */
export interface PurgeTx {
  report: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  homeCurationOverride: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  notification: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  commentWaveQueue: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  userPostWaveQueue: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
  comment: { findMany(a: { where: unknown; select: unknown }): Promise<{ id: string }[]> }
  post: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
}

export interface TransactionOptions { maxWait?: number; timeout?: number }
export interface TransactionRunner {
  $transaction<T>(fn: (tx: PurgeTx) => Promise<T>, options?: TransactionOptions): Promise<T>
}

/** 단계별 기대 영향 행 수. dry-run 에서 실측한 값을 그대로 넘긴다. */
export interface ExpectedCounts {
  reportOnComment: number
  reportOnPost: number
  homeCurationOverride: number
  notification: number
  commentWaveQueue: number
  userPostWaveQueue: number
  post: number
}

export interface StepResult { step: string; affected: number; expected: number }

function assertAffected(step: string, affected: number, expected: number): void {
  if (affected !== expected) {
    throw new PurgeAbortError(
      'AFFECTED_MISMATCH',
      `[ABORT] ${step} 영향 행 ${affected} ≠ 기대 ${expected} — 트랜잭션을 되돌린다`,
    )
  }
}

/**
 * 삭제를 한 트랜잭션으로 실행한다.
 *
 * `postIds` 는 **보호 신호 제외까지 끝난 최종 목록**이어야 한다.
 * 여기서는 더 이상 걸러내지 않는다 — 판정은 계획 단계의 몫이다.
 */
export async function executePurge(
  db: TransactionRunner,
  postIds: readonly string[],
  expected: ExpectedCounts,
  boardTypes: readonly string[],
): Promise<StepResult[]> {
  if (postIds.length === 0) {
    throw new PurgeAbortError('EMPTY_TARGET', '[ABORT] 삭제 대상이 0건이다 — 실행하지 않는다')
  }

  return db.$transaction(async (tx) => {
    const steps: StepResult[] = []
    const byPost = { postId: { in: postIds as string[] } }

    // 0) 이 글들에 달린 댓글 ID — Report(commentId) 가 Restrict 라 먼저 알아야 한다.
    const comments = await tx.comment.findMany({ where: byPost, select: { id: true } })
    const commentIds = comments.map((c) => c.id)

    // 1) Restrict 를 푸는 단계. 순서를 바꾸면 FK 가 막는다.
    const r1 = commentIds.length
      ? await tx.report.deleteMany({ where: { commentId: { in: commentIds } } })
      : { count: 0 }
    assertAffected('Report(comment)', r1.count, expected.reportOnComment)
    steps.push({ step: 'Report(comment)', affected: r1.count, expected: expected.reportOnComment })

    const r2 = await tx.report.deleteMany({ where: byPost })
    assertAffected('Report(post)', r2.count, expected.reportOnPost)
    steps.push({ step: 'Report(post)', affected: r2.count, expected: expected.reportOnPost })

    const r3 = await tx.homeCurationOverride.deleteMany({ where: byPost })
    assertAffected('HomeCurationOverride', r3.count, expected.homeCurationOverride)
    steps.push({ step: 'HomeCurationOverride', affected: r3.count, expected: expected.homeCurationOverride })

    // 2) 고아가 될 것들. SetNull·FK 없음이라 CASCADE 가 치워주지 않는다.
    const r4 = await tx.notification.deleteMany({ where: byPost })
    assertAffected('Notification', r4.count, expected.notification)
    steps.push({ step: 'Notification', affected: r4.count, expected: expected.notification })

    const r5 = await tx.commentWaveQueue.deleteMany({ where: byPost })
    assertAffected('CommentWaveQueue', r5.count, expected.commentWaveQueue)
    steps.push({ step: 'CommentWaveQueue', affected: r5.count, expected: expected.commentWaveQueue })

    const r6 = await tx.userPostWaveQueue.deleteMany({ where: byPost })
    assertAffected('UserPostWaveQueue', r6.count, expected.userPostWaveQueue)
    steps.push({ step: 'UserPostWaveQueue', affected: r6.count, expected: expected.userPostWaveQueue })

    // 3) 본체. 낙관적 잠금 — 상태·보드가 그 사이 바뀌었으면 행이 안 잡히고 수가 어긋난다.
    const r7 = await tx.post.deleteMany({
      where: {
        id: { in: postIds as string[] },
        status: 'PUBLISHED',
        boardType: { in: boardTypes as string[] },
      },
    })
    assertAffected('Post', r7.count, expected.post)
    steps.push({ step: 'Post', affected: r7.count, expected: expected.post })

    return steps
  }, { ...TRANSACTION_OPTIONS })
}
