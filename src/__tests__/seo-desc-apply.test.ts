/**
 * SEO description 적용 도구 — **실패 주입** 테스트.
 *
 * 여기서 확인하는 것은 "성공하면 잘 된다"가 아니라 **"실패하면 아무것도 쓰지 않는다"** 이다.
 * 부분 반영은 이 작업에서 가장 나쁜 결과다 — 어느 글이 옛 문구인지 알 수 없게 되고,
 * 롤백 기준값도 흐트러진다.
 */
import { describe, it, expect } from 'vitest'
import {
  parseCsv, toRewriteRows, buildPlan, detectDrift, exactEquals, csvToDbValue,
  EXPECTED_APPLY_ROWS, CONFIRM_TOKEN,
  type RewriteRow, type LiveRow,
} from '@/lib/seo/desc-apply-plan'
import {
  executeInTransaction, ApplyAbortError,
  type TransactionRunner, type PostUpdater,
} from '@/lib/seo/desc-apply-exec'
import { extractMetaDescription, unapprovedBanned } from '@/lib/seo/desc-verify'

// ── 가짜 CSV 생성 ────────────────────────────────────────────
const COLS = [
  'id', 'boardType', 'source', 'rewriteDecision', 'applyEligible', 'targetField',
  'bannedTerms', 'termProvenance', 'provenanceDetail',
  'currentSeoTitle', 'proposedSeoTitle', 'currentSeoDescription', 'proposedSeoDescription',
  'currentSeoTitleSha256_12', 'currentSeoDescriptionSha256_12', 'liveValueVerifiedAt',
  'sourceTitleUnchanged', 'rewriteRationale', 'factCheckPassed', 'factAxesVerified',
  'properNounOverlapToken', 'residualBrandCopy', 'needsHumanReview', 'reviewReason',
]

function row(over: Partial<RewriteRow> & { id: string }): RewriteRow {
  const base: Record<string, string> = Object.fromEntries(COLS.map((c) => [c, '']))
  return {
    ...base,
    boardType: 'JOB',
    source: 'SHEET',
    rewriteDecision: 'REWRITE_BRAND_COPY',
    applyEligible: 'true',
    currentSeoTitle: `제목 ${over.id}`,
    currentSeoDescription: `옛 문구 ${over.id}`,
    proposedSeoDescription: `새 문구 ${over.id}`,
    ...over,
  } as RewriteRow
}

/** 정상 59행 — 적용 50 + 보류 9 */
function validRows(): RewriteRow[] {
  const rows: RewriteRow[] = []
  for (let i = 0; i < 50; i++) rows.push(row({ id: `ok${i}` }))
  for (let i = 0; i < 4; i++) rows.push(row({ id: `hold${i}`, rewriteDecision: 'BRAND_COPY_HOLD_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  rows.push(row({ id: 'partial0', rewriteDecision: 'BRAND_COPY_PARTIAL_HOLD_REVIEW', applyEligible: 'false' }))
  for (let i = 0; i < 3; i++) rows.push(row({ id: `official${i}`, rewriteDecision: 'OFFICIAL_NAME_ONLY_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  rows.push(row({ id: 'srctitle0', rewriteDecision: 'SOURCE_TITLE_ONLY_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  return rows
}

function liveFrom(rows: RewriteRow[]): LiveRow[] {
  return rows.filter((r) => r.applyEligible === 'true').map((r) => ({
    id: r.id,
    seoTitle: csvToDbValue(r.currentSeoTitle),
    seoDescription: csvToDbValue(r.currentSeoDescription),
  }))
}

// ── 가짜 Prisma ──────────────────────────────────────────────
interface FakeOpts {
  /** 이 순번(1-base)의 update 가 영향 행 0을 돌려준다 = 부분 반영 시도 */
  zeroAt?: number
  /** 이 순번에서 예외를 던진다 = 트랜잭션 도중 실패 */
  throwAt?: number
  /** 이 순번이 2행에 영향을 준다 = 조건이 헐거움 */
  twoAt?: number
}
function fakeDb(opts: FakeOpts = {}) {
  const writes: { id: string; value: string | null }[] = []
  let committed = false
  const db: TransactionRunner = {
    async $transaction<T>(fn: (tx: PostUpdater) => Promise<T>): Promise<T> {
      const staged: typeof writes = []
      let n = 0
      const tx: PostUpdater = {
        post: {
          async updateMany(args) {
            n++
            if (opts.throwAt === n) throw new Error('DB 연결 끊김(주입)')
            if (opts.zeroAt === n) return { count: 0 }
            if (opts.twoAt === n) return { count: 2 }
            staged.push({ id: args.where.id, value: args.data.seoDescription })
            return { count: 1 }
          },
        },
      }
      try {
        const out = await fn(tx)
        writes.push(...staged)   // commit 시에만 반영
        committed = true
        return out
      } catch (e) {
        throw e                  // rollback — staged 를 버린다
      }
    },
  }
  return { db, writes, get committed() { return committed } }
}

// ─────────────────────────────────────────────────────────────
describe('CSV 파싱', () => {
  it('따옴표 안의 쉼표·줄바꿈·이스케이프 따옴표를 보존한다', () => {
    const csv = 'id,desc\nA,"쉼표, 포함"\nB,"줄\n바꿈"\nC,"따옴표 ""인용"""\n'
    const out = parseCsv(csv)
    expect(out).toHaveLength(3)
    expect(out[0].desc).toBe('쉼표, 포함')
    expect(out[1].desc).toBe('줄\n바꿈')
    expect(out[2].desc).toBe('따옴표 "인용"')
  })

  it('열 수가 어긋나면 조용히 넘어가지 않고 던진다', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/열 수 불일치/)
  })

  it('닫히지 않은 따옴표를 던진다', () => {
    expect(() => parseCsv('a,b\n1,"미완성\n')).toThrow(/닫히지 않은 따옴표/)
  })

  it('필수 열이 없으면 던진다', () => {
    expect(() => toRewriteRows(parseCsv('id,boardType\nX,JOB\n'))).toThrow(/열 누락/)
  })
})

describe('빈 문자열과 null 을 구분한다', () => {
  it('CSV 빈 문자열은 DB null 로 읽는다', () => {
    expect(csvToDbValue('')).toBeNull()
    expect(csvToDbValue('값')).toBe('값')
  })

  it('null 과 빈 문자열은 같지 않다', () => {
    expect(exactEquals(null, '')).toBe(false)
    expect(exactEquals(undefined, null)).toBe(true)
    expect(exactEquals('a', 'a')).toBe(true)
  })

  it('공백만 다른 값을 같다고 보지 않는다(정규화 없음)', () => {
    expect(exactEquals('가 나', '가  나')).toBe(false)
    expect(exactEquals('가나 ', '가나')).toBe(false)
  })
})

describe('계획 검증 — 전부 아니면 전무', () => {
  it('정상 59행이면 통과하고 대상은 정확히 50이다', () => {
    const plan = buildPlan(validRows(), 'apply')
    expect(plan.ok).toBe(true)
    expect(plan.targets).toHaveLength(EXPECTED_APPLY_ROWS)
    expect(plan.excluded).toBe(9)
  })

  it('행이 하나라도 늘거나 줄면 막는다', () => {
    const plan = buildPlan([...validRows(), row({ id: 'extra' })], 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('ROW_COUNT')
  })

  it('보류 행이 applyEligible=true 로 섞이면 막는다', () => {
    const rows = validRows()
    rows[54] = { ...rows[54], applyEligible: 'true' }   // partial0
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('ELIGIBLE_MISMATCH')
  })

  it('중복 id 를 막는다', () => {
    const rows = validRows()
    rows[1] = { ...rows[1], id: rows[0].id }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('DUPLICATE_ID')
  })

  it('no-op(현재값 = 제안값)을 막는다', () => {
    const rows = validRows()
    rows[3] = { ...rows[3], proposedSeoDescription: rows[3].currentSeoDescription }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('NO_OP')
  })

  it('seoTitle 제안값이 있으면 막는다 — title 은 write 대상이 아니다', () => {
    const rows = validRows()
    rows[7] = { ...rows[7], proposedSeoTitle: '새 제목' }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('TITLE_PROPOSAL')
  })

  it('JOB 이 아닌 행이 적용 대상에 있으면 막는다', () => {
    const rows = validRows()
    rows[2] = { ...rows[2], boardType: 'MAGAZINE' }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('BOARD_TYPE')
  })

  it('분류 합계가 어긋나면 막는다', () => {
    const rows = validRows()
    rows[58] = { ...rows[58], rewriteDecision: 'BRAND_COPY_HOLD_REVIEW' }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('DECISION_COUNT')
  })

  it('모르는 분류가 들어오면 막는다', () => {
    const rows = validRows()
    rows[58] = { ...rows[58], rewriteDecision: 'SOMETHING_NEW' }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('DECISION_UNKNOWN')
  })

  it('롤백 모드는 기대값과 목표값이 apply 와 정확히 뒤집힌다', () => {
    const rows = validRows()
    const apply = buildPlan(rows, 'apply')
    const back = buildPlan(rows, 'rollback')
    expect(back.ok).toBe(true)
    expect(back.targets[0].expectedSeoDescription).toBe(apply.targets[0].nextSeoDescription)
    expect(back.targets[0].nextSeoDescription).toBe(apply.targets[0].expectedSeoDescription)
    // seoTitle 기대값은 두 모드에서 같다 — title 은 바뀌지 않으니까
    expect(back.targets[0].expectedSeoTitle).toBe(apply.targets[0].expectedSeoTitle)
  })
})

describe('drift 대조', () => {
  const rows = validRows()
  const plan = buildPlan(rows, 'apply')

  it('전부 일치하면 통과한다', () => {
    expect(detectDrift(plan.targets, liveFrom(rows)).ok).toBe(true)
  })

  it('한 건이라도 누락되면 막는다', () => {
    const d = detectDrift(plan.targets, liveFrom(rows).slice(1))
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['LIVE_COUNT', 'MISSING']))
  })

  it('조회 결과에 중복이 있으면 막는다', () => {
    const live = liveFrom(rows)
    const d = detectDrift(plan.targets, [...live, live[0]])
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('LIVE_DUPLICATE')
  })

  it('대상 밖 id 가 섞이면 막는다', () => {
    const live = liveFrom(rows)
    live[0] = { ...live[0], id: '대상아님' }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['MISSING', 'LIVE_EXTRA']))
  })

  it('seoDescription drift 를 잡는다', () => {
    const live = liveFrom(rows)
    live[10] = { ...live[10], seoDescription: '누가 그 사이 고쳤다' }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('DRIFT_DESCRIPTION')
  })

  it('seoTitle 이 바뀌어 있어도 막는다 — write 대상이 아니어도 전제는 깨진 것이다', () => {
    const live = liveFrom(rows)
    live[5] = { ...live[5], seoTitle: '바뀐 제목' }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('DRIFT_TITLE')
  })

  it('null 이 빈 문자열로 바뀌어 있어도 drift 로 잡는다', () => {
    const live = liveFrom(rows)
    live[3] = { ...live[3], seoDescription: null }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
  })

  it('이미 적용된 상태에서 재실행하면 ALREADY_APPLIED 로 막는다 (멱등 덮어쓰기 금지)', () => {
    const live = liveFrom(rows).map((r, i) =>
      i === 0 ? { ...r, seoDescription: `새 문구 ${r.id}` } : r)
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.alreadyApplied).toBe(1)
    expect(d.issues.map((i) => i.code)).toContain('ALREADY_APPLIED')
  })
})

describe('트랜잭션 실행', () => {
  const rows = validRows()
  const plan = buildPlan(rows, 'apply')

  it('정상이면 50건을 commit 한다', async () => {
    const f = fakeDb()
    const res = await executeInTransaction(f.db, plan.targets, EXPECTED_APPLY_ROWS)
    expect(res.affected).toBe(50)
    expect(f.writes).toHaveLength(50)
    expect(f.committed).toBe(true)
  })

  it('seoDescription 외의 필드를 data 에 넣지 않는다', async () => {
    const seen: string[][] = []
    const db: TransactionRunner = {
      async $transaction(fn) {
        return fn({ post: { async updateMany(args) { seen.push(Object.keys(args.data)); return { count: 1 } } } })
      },
    }
    await executeInTransaction(db, plan.targets, EXPECTED_APPLY_ROWS)
    expect(new Set(seen.flat())).toEqual(new Set(['seoDescription']))
  })

  it('낙관적 잠금 조건에 id·seoTitle·seoDescription 을 모두 건다', async () => {
    const seen: string[][] = []
    const db: TransactionRunner = {
      async $transaction(fn) {
        return fn({ post: { async updateMany(args) { seen.push(Object.keys(args.where)); return { count: 1 } } } })
      },
    }
    await executeInTransaction(db, plan.targets, EXPECTED_APPLY_ROWS)
    expect(new Set(seen[0])).toEqual(new Set(['id', 'seoTitle', 'seoDescription']))
  })

  it('영향 행 0이 하나라도 나오면 전체 rollback 한다 (부분 반영 금지)', async () => {
    const f = fakeDb({ zeroAt: 20 })
    await expect(executeInTransaction(f.db, plan.targets, EXPECTED_APPLY_ROWS))
      .rejects.toThrow(ApplyAbortError)
    expect(f.writes).toHaveLength(0)
    expect(f.committed).toBe(false)
  })

  it('영향 행이 2면(조건이 헐거우면) 막는다', async () => {
    const f = fakeDb({ twoAt: 1 })
    await expect(executeInTransaction(f.db, plan.targets, EXPECTED_APPLY_ROWS))
      .rejects.toMatchObject({ code: 'AFFECTED_NOT_ONE' })
    expect(f.writes).toHaveLength(0)
  })

  it('도중에 예외가 나면 전체 rollback 한다', async () => {
    const f = fakeDb({ throwAt: 33 })
    await expect(executeInTransaction(f.db, plan.targets, EXPECTED_APPLY_ROWS))
      .rejects.toThrow('DB 연결 끊김(주입)')
    expect(f.writes).toHaveLength(0)
    expect(f.committed).toBe(false)
  })

  it('실패하면 첫 실패 지점에서 멈춘다 — 뒤를 더 쓰지 않는다', async () => {
    let calls = 0
    const db: TransactionRunner = {
      async $transaction(fn) {
        return fn({ post: { async updateMany() { calls++; return { count: calls === 5 ? 0 : 1 } } } })
      },
    }
    await expect(executeInTransaction(db, plan.targets, EXPECTED_APPLY_ROWS)).rejects.toThrow()
    expect(calls).toBe(5)
  })

  it('대상 수가 50이 아니면 트랜잭션을 열지도 않는다', async () => {
    let opened = false
    const db: TransactionRunner = {
      async $transaction(fn) { opened = true; return fn({ post: { async updateMany() { return { count: 1 } } } }) },
    }
    await expect(executeInTransaction(db, plan.targets.slice(0, 49), EXPECTED_APPLY_ROWS))
      .rejects.toMatchObject({ code: 'TARGET_COUNT' })
    expect(opened).toBe(false)
  })
})

describe('롤백', () => {
  const rows = validRows()

  it('적용 후 상태에서 옛 값을 정확히 복원한다', async () => {
    const back = buildPlan(rows, 'rollback')
    const f = fakeDb()
    await executeInTransaction(f.db, back.targets, EXPECTED_APPLY_ROWS)
    expect(f.writes).toHaveLength(50)
    expect(f.writes[0].value).toBe(csvToDbValue(rows[0].currentSeoDescription))
  })

  it('적용 전 상태에서 롤백을 시도하면 drift 로 막힌다 (fail-closed)', () => {
    const back = buildPlan(rows, 'rollback')
    // production 이 아직 옛 값 = 롤백 기대값(제안값)과 다르다
    const d = detectDrift(back.targets, liveFrom(rows), 'rollback')
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('ALREADY_APPLIED')
    expect(d.issues[0].detail).toContain('되돌릴 것이 없다')
  })

  it('롤백 후 재롤백도 막힌다', () => {
    const back = buildPlan(rows, 'rollback')
    const live = back.targets.map((t) => ({
      id: t.id, seoTitle: t.expectedSeoTitle, seoDescription: t.nextSeoDescription,
    }))
    expect(detectDrift(back.targets, live).ok).toBe(false)
  })
})

describe('확인 토큰', () => {
  it('모드마다 다른 토큰을 요구한다', () => {
    expect(CONFIRM_TOKEN.apply).not.toBe(CONFIRM_TOKEN.rollback)
    expect(CONFIRM_TOKEN.apply).toBe('APPLY-SEO-DESC-50')
    expect(CONFIRM_TOKEN.rollback).toBe('ROLLBACK-SEO-DESC-50')
  })
})

describe('production meta 파싱·판정', () => {
  it('속성 순서와 따옴표 종류에 관계없이 description 을 뽑는다', () => {
    expect(extractMetaDescription('<meta name="description" content="가나다">')).toBe('가나다')
    expect(extractMetaDescription("<meta content='가나다' name='description'>")).toBe('가나다')
    expect(extractMetaDescription('<meta charset="utf-8"><meta name="description" content="두번째">')).toBe('두번째')
  })

  it('og:description 을 description 으로 착각하지 않는다', () => {
    expect(extractMetaDescription('<meta property="og:description" content="og">')).toBeNull()
  })

  it('HTML 엔티티를 디코딩하고 &amp; 를 이중 디코딩하지 않는다', () => {
    expect(extractMetaDescription('<meta name="description" content="A &amp;quot;B">')).toBe('A &quot;B')
    expect(extractMetaDescription('<meta name="description" content="월 242&#44;000원">')).toBe('월 242,000원')
  })

  it('승인된 공식 직함은 금지 표현으로 세지 않는다', () => {
    expect(unapprovedBanned('강원 노인요양원 취업 동해시 요양 복지사 모집')).toEqual([])
    expect(unapprovedBanned('사당복지관 생활지원사 채용 노인돌봄 50대 일자리')).toEqual([])
    expect(unapprovedBanned('청주 노인주간보호센터 구인')).toEqual([])
  })

  it('승인되지 않은 금지 표현은 잡는다', () => {
    expect(unapprovedBanned('김포시 실버케어 채용')).toEqual(['실버'])
    expect(unapprovedBanned('어르신 곁에서 보람 있는 일')).toEqual(['어르신'])
    expect(unapprovedBanned('경기 노인복지 요양보호사')).toEqual(['노인'])
  })
})
