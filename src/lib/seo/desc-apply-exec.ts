/**
 * 적용/롤백 트랜잭션 — **DB 클라이언트를 주입받는다.**
 *
 * Prisma 를 직접 import 하지 않는 이유는 하나다: 실패 주입 테스트를 하기 위해서다.
 * "부분 반영", "영향 행 0", "트랜잭션 도중 예외" 같은 것은 실제 DB 로는 재현하기 어렵고,
 * 재현하려고 production 에 쓰면 그 자체가 사고다.
 *
 * 여기서 지키는 계약:
 *   - update 는 **낙관적 잠금**이다. `where` 에 기대값을 함께 걸어 그 사이 값이 바뀌면 0행이 된다.
 *   - 각 update 의 영향 행은 정확히 **1** 이어야 한다.
 *   - 합계가 대상 수와 다르면 **throw** 한다 → 트랜잭션 전체 rollback → mutation 0.
 *   - raw SQL 을 쓰지 않는다(프로젝트 규칙).
 *   - `seoDescription` 외의 어떤 필드도 `data` 에 넣지 않는다.
 */
import type { ApplyTarget } from './desc-apply-plan'

/** `prisma.post.updateMany` 의 우리가 쓰는 부분만. */
export interface PostUpdater {
  post: {
    updateMany(args: {
      where: { id: string; seoTitle: string | null; seoDescription: string | null }
      data: { seoDescription: string | null }
    }): Promise<{ count: number }>
  }
}

/** `prisma.$transaction(fn)` 의 우리가 쓰는 부분만. */
export interface TransactionRunner {
  $transaction<T>(fn: (tx: PostUpdater) => Promise<T>): Promise<T>
}

export class ApplyAbortError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ApplyAbortError'
  }
}

export interface ExecResult {
  affected: number
  attempted: number
}

/**
 * 대상 전체를 하나의 트랜잭션에서 수정한다.
 *
 * 영향 행이 1이 아닌 순간 즉시 throw 한다. 끝까지 돌려보고 합계만 확인하면
 * 실패한 행 뒤의 업데이트가 불필요하게 더 실행된다 — 어차피 rollback 될 것들이다.
 */
export async function executeInTransaction(
  db: TransactionRunner,
  targets: ApplyTarget[],
  expectedCount: number,
): Promise<ExecResult> {
  if (targets.length !== expectedCount) {
    throw new ApplyAbortError(
      'TARGET_COUNT',
      `대상이 ${expectedCount} 건이 아니다 (실제 ${targets.length}) — 쓰지 않는다`,
    )
  }

  return db.$transaction(async (tx) => {
    let affected = 0
    let attempted = 0
    for (const t of targets) {
      attempted++
      const res = await tx.post.updateMany({
        // 낙관적 잠금 — 사전 조회와 write 사이에 값이 바뀌면 0행이 된다
        where: {
          id: t.id,
          seoTitle: t.expectedSeoTitle,
          seoDescription: t.expectedSeoDescription,
        },
        data: { seoDescription: t.nextSeoDescription },
      })
      if (res.count !== 1) {
        throw new ApplyAbortError(
          'AFFECTED_NOT_ONE',
          `영향 행이 1이 아니다 (id 순번 ${attempted}, count=${res.count}) — 전체 rollback`,
        )
      }
      affected += res.count
    }
    if (affected !== expectedCount) {
      throw new ApplyAbortError(
        'AFFECTED_TOTAL',
        `영향 행 합계가 ${expectedCount} 이 아니다 (실제 ${affected}) — 전체 rollback`,
      )
    }
    return { affected, attempted }
  })
}
