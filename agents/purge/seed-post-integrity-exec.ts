/**
 * 공개 시드 글 3건 — Serializable 트랜잭션 실행.
 *
 * ── 🔴 구조로 막는다 ────────────────────────────────────────
 *  **Post 와 반응 데이터는 삭제하지 않는다. `HomeCurationOverride` 2건만 의도적으로 제거한다.**
 *  그래서 트랜잭션 인터페이스(`SeedTx`)에
 *  `comment`·`like`·`guestLike`·`postView` 를 **아예 넣지 않았다.**
 *  실수로 그 테이블을 건드리는 코드를 쓰면 **컴파일이 안 된다.**
 *  주석으로 "건드리지 마라"라고 적는 것보다 이게 확실하다.
 *
 *  `post.updateMany` 만 쓴다 — `delete`·`deleteMany` 는 인터페이스에 없다.
 *  `data` 에는 `status`·`source` 두 필드만 넣는다(§`assertPatchShape`).
 */
import {
  TRANSACTION_OPTIONS, EXPECTED_FROM, EXPECTED_TO, sha256, verifyIdentity,
  type ManifestRow, type LivePostRow,
} from './seed-post-integrity.js'

export class SeedAbortError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SeedAbortError'
  }
}

export interface UpdateManyResult { count: number }
export interface DeleteManyResult { count: number }

/**
 * 트랜잭션에서 쓸 수 있는 것 **전부**.
 *
 * 반응 데이터 테이블이 없다는 게 이 타입의 핵심이다.
 * `post` 는 `updateMany` 만 있고 삭제 경로가 없다.
 */
export interface SeedTx {
  post: {
    findMany(a: { where: unknown; select: unknown }): Promise<Array<{
      id: string; authorId: string | null; boardType: string
      status: string; source: string | null; title: string; content: string
      author: { providerId: string } | null
    }>>
    updateMany(a: { where: unknown; data: unknown }): Promise<UpdateManyResult>
  }
  homeCurationOverride: { deleteMany(a: { where: unknown }): Promise<DeleteManyResult> }
}

export interface TransactionOptions { maxWait?: number; timeout?: number; isolationLevel?: string }
export interface TransactionRunner {
  $transaction<T>(fn: (tx: SeedTx) => Promise<T>, options?: TransactionOptions): Promise<T>
}

/** 바꿔도 되는 필드는 둘뿐이다. 그 외가 섞이면 던진다. */
export const ALLOWED_PATCH_KEYS = ['status', 'source'] as const

export function assertPatchShape(patch: Record<string, unknown>): void {
  const keys = Object.keys(patch)
  const extra = keys.filter((k) => !(ALLOWED_PATCH_KEYS as readonly string[]).includes(k))
  if (extra.length > 0) {
    throw new SeedAbortError('PATCH_SHAPE', `[ABORT] 허용되지 않은 필드를 쓰려 한다: ${extra.join(', ')}`)
  }
  if (patch.status !== EXPECTED_TO.status || patch.source !== EXPECTED_TO.source) {
    throw new SeedAbortError('PATCH_VALUE', '[ABORT] status·source 값이 계약과 다르다')
  }
}

export interface SeedOutcome {
  updatedIds: string[]
  updated: number
  curationDeleted: number
}

export interface ExecDeps {
  /** 🔴 확정 manifest. 대상 ID 는 여기서만 나온다 — 호출자가 고른 목록을 믿지 않는다. */
  manifest: readonly ManifestRow[]
  /** 지워야 할 HomeCurationOverride 수. 다르면 ABORT. */
  expectedCurationDeletes: number
}

const isSerializationConflict = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code
  if (code === 'P2034') return true
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /could not serialize|serialization failure|write conflict|deadlock detected/i.test(msg)
}

/**
 * 세 글의 `status`·`source` 만 바꾸고 큐레이션 고정을 푼다.
 *
 * 낙관적 잠금: `where` 에 기대 `status`·`source` 를 넣는다.
 * 그 사이 누가 바꿨으면 행이 안 잡히고 수가 어긋나 ABORT 된다.
 */
export async function executeSeedHide(
  db: TransactionRunner,
  deps: ExecDeps,
): Promise<SeedOutcome> {
  const ids = deps.manifest.map((m) => m.id)
  if (ids.length === 0) {
    throw new SeedAbortError('EMPTY_TARGET', '[ABORT] 대상이 0건이다 — 실행하지 않는다')
  }

  const patch: Record<string, unknown> = { status: EXPECTED_TO.status, source: EXPECTED_TO.source }
  assertPatchShape(patch)

  return db.$transaction(async (tx) => {
    // 🔴 트랜잭션 안에서 identity **여덟 축**을 다시 본다.
    //    id · authorId(해시) · providerId · boardType · status · source · title(해시) · content(해시).
    const rows = await tx.post.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, authorId: true, boardType: true, status: true, source: true,
        title: true, content: true, author: { select: { providerId: true } },
      },
    })
    const live: LivePostRow[] = rows.map((p) => ({
      id: p.id,
      authorId: p.authorId ?? '',
      authorIdSha256: p.authorId ? sha256(p.authorId) : '',
      providerId: p.author?.providerId ?? null,
      boardType: p.boardType,
      status: p.status,
      source: p.source,
      titleSha256: sha256(p.title),
      contentSha256: sha256(p.content),
    }))
    const identityIssues = verifyIdentity(deps.manifest, live)
    if (identityIssues.length > 0) {
      const codes = [...new Set(identityIssues.map((i) => i.code))].join(', ')
      throw new SeedAbortError('IDENTITY', `[ABORT] 트랜잭션 안에서 identity 불일치 — ${codes}`)
    }

    const curation = await tx.homeCurationOverride.deleteMany({ where: { postId: { in: ids } } })
    if (curation.count !== deps.expectedCurationDeletes) {
      throw new SeedAbortError(
        'CURATION_COUNT',
        `[ABORT] HomeCurationOverride 영향 행 ${curation.count} ≠ 기대 ${deps.expectedCurationDeletes}`,
      )
    }

    // 낙관적 잠금 — 확정 ID + 기대 status·source 를 where 에 넣는다.
    const res = await tx.post.updateMany({
      where: {
        id: { in: ids },
        status: EXPECTED_FROM.status,
        source: EXPECTED_FROM.source,
      },
      data: patch,
    })
    if (res.count !== ids.length) {
      throw new SeedAbortError('AFFECTED_MISMATCH', `[ABORT] 영향 행 ${res.count} ≠ 대상 ${ids.length}`)
    }

    return { updatedIds: ids, updated: res.count, curationDeleted: curation.count }
  }, { ...TRANSACTION_OPTIONS }).catch((e: unknown) => {
    // 직렬화 충돌은 재시도하지 않는다 — 롤백된 상태 = mutation 0 이다.
    if (isSerializationConflict(e)) {
      throw new SeedAbortError('SERIALIZATION_CONFLICT', '[ABORT] 직렬화 충돌로 롤백됐다 — 재시도하지 않는다')
    }
    throw e
  })
}
