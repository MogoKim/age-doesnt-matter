/**
 * Codex 리뷰 findings 회귀 테스트 — **구현보다 먼저 쓴 실패 테스트**.
 *
 * 1. CSV 전체 SHA-256 + 행별 current 해시를 runtime 에서 강제 검증
 * 2. boardType/status 를 조회·대조·낙관적 잠금에 포함
 * 3. $transaction 에 maxWait/timeout 을 명시
 * 4. 캐시 판정을 DB 롤백 사유와 분리(CACHE_PENDING)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildPlan, detectDrift,
  assertCsvIntegrity, CSV_SHA256, TRANSACTION_OPTIONS,
} from '@/lib/seo/desc-apply-plan'
import { executeInTransaction, type TransactionRunner } from '@/lib/seo/desc-apply-exec'
import { classifyVerifyOutcome } from '@/lib/seo/desc-verify'
import { validRows, liveFrom } from './helpers/seo-desc-fixture'

// ── 1. CSV 무결성 ────────────────────────────────────────────
describe('finding 1 — CSV 무결성을 runtime 에서 강제한다', () => {
  const CSV = resolve(process.cwd(), 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv')
  const raw = readFileSync(CSV, 'utf8')

  it('고정 SHA-256 전체값이 상수로 박혀 있다', () => {
    expect(CSV_SHA256).toBe('17f44bb785ac12464f425c6c5f432ca288ce26de8726c7aa70a0eff303887280')
  })

  it('확정 CSV 는 통과한다', () => {
    expect(() => assertCsvIntegrity(raw)).not.toThrow()
  })

  it('CSV 를 한 글자만 바꿔도 실패한다', () => {
    const tampered = raw.replace('월 141만원', '월 142만원')
    expect(tampered).not.toBe(raw)
    expect(() => assertCsvIntegrity(tampered)).toThrow(/SHA-256/)
  })

  it('공백 하나만 덧붙여도 실패한다', () => {
    expect(() => assertCsvIntegrity(raw + ' ')).toThrow(/SHA-256/)
  })

  it('행별 current 해시를 다시 계산해 검증한다 — CSV 열이 조작되면 잡는다', () => {
    const rows = validRows()
    // 해시 열이 실제 값과 맞지 않는다
    rows[0] = { ...rows[0], currentSeoDescriptionSha256_12: 'deadbeef1234' }
    const plan = buildPlan(rows, 'apply')
    expect(plan.ok).toBe(false)
    expect(plan.issues.map((i) => i.code)).toContain('HASH_MISMATCH')
  })

  it('행별 해시가 맞으면 통과한다', () => {
    const plan = buildPlan(validRows(), 'apply')
    expect(plan.issues.filter((i) => i.code === 'HASH_MISMATCH')).toEqual([])
  })
})

// ── 2. boardType / status ────────────────────────────────────
describe('finding 2 — boardType/status 를 대조하고 잠근다', () => {
  const rows = validRows()
  const plan = buildPlan(rows, 'apply')

  it('전부 JOB/PUBLISHED 면 통과한다', () => {
    expect(detectDrift(plan.targets, liveFrom(rows)).ok).toBe(true)
  })

  it('status 가 PUBLISHED 가 아니면 막는다', () => {
    const live = liveFrom(rows)
    live[7] = { ...live[7], status: 'HIDDEN' }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('DRIFT_STATUS')
  })

  it('boardType 이 JOB 이 아니면 막는다', () => {
    const live = liveFrom(rows)
    live[3] = { ...live[3], boardType: 'MAGAZINE' }
    const d = detectDrift(plan.targets, live)
    expect(d.ok).toBe(false)
    expect(d.issues.map((i) => i.code)).toContain('DRIFT_BOARD_TYPE')
  })

  it('DELETED 로 바뀐 글이 섞여도 mutation 0 으로 막는다', () => {
    const live = liveFrom(rows)
    live[0] = { ...live[0], status: 'DELETED' }
    expect(detectDrift(plan.targets, live).ok).toBe(false)
  })

  it('updateMany where 에 boardType 과 status 가 함께 걸린다', async () => {
    const seen: string[][] = []
    const db: TransactionRunner = {
      async $transaction(fn) {
        return fn({ post: { async updateMany(args) { seen.push(Object.keys(args.where)); return { count: 1 } } } })
      },
    }
    await executeInTransaction(db, plan.targets, 50)
    expect(new Set(seen[0])).toEqual(
      new Set(['id', 'boardType', 'status', 'seoTitle', 'seoDescription']))
  })

  it('낙관적 잠금 값이 JOB/PUBLISHED 로 고정된다', async () => {
    const seen: Record<string, unknown>[] = []
    const db: TransactionRunner = {
      async $transaction(fn) {
        return fn({ post: { async updateMany(args) { seen.push(args.where); return { count: 1 } } } })
      },
    }
    await executeInTransaction(db, plan.targets, 50)
    for (const w of seen) {
      expect(w.boardType).toBe('JOB')
      expect(w.status).toBe('PUBLISHED')
    }
  })
})

// ── 3. 트랜잭션 옵션 ──────────────────────────────────────────
describe('finding 3 — Prisma 기본 5초 제한에 기대지 않는다', () => {
  const plan = buildPlan(validRows(), 'apply')

  it('maxWait/timeout 상수가 기본값보다 넉넉하다', () => {
    expect(TRANSACTION_OPTIONS.maxWait).toBeGreaterThan(2_000)
    expect(TRANSACTION_OPTIONS.timeout).toBeGreaterThan(5_000)
  })

  it('$transaction 호출에 옵션이 실제로 전달된다', async () => {
    let passed: unknown
    const db: TransactionRunner = {
      async $transaction(fn, options) {
        passed = options
        return fn({ post: { async updateMany() { return { count: 1 } } } })
      },
    }
    await executeInTransaction(db, plan.targets, 50)
    expect(passed).toEqual(TRANSACTION_OPTIONS)
  })
})

// ── 4. 캐시 판정 분리 ─────────────────────────────────────────
describe('finding 4 — HTML 불일치는 DB 롤백 사유가 아니다', () => {
  const zero = { total: 50, matched: 0, pending: 0, unexpected: 0, fetchFailed: 0, violation: 0 }

  it('전건 일치면 OK', () => {
    expect(classifyVerifyOutcome({ ...zero, matched: 50 })).toMatchObject({ outcome: 'OK' })
  })

  it('아직 반영 안 된 건이 있으면 CACHE_PENDING 이고 롤백을 권고하지 않는다', () => {
    const r = classifyVerifyOutcome({ ...zero, matched: 30, pending: 20 }, 'after')
    expect(r.outcome).toBe('CACHE_PENDING')
    expect(r.shouldRollback).toBe(false)
    expect(r.hint).toMatch(/캐시/)
  })

  it('예상 밖 값도 롤백 사유가 아니지만 따로 알려준다', () => {
    const r = classifyVerifyOutcome({ ...zero, matched: 49, unexpected: 1 }, 'after')
    expect(r.outcome).toBe('CACHE_PENDING')
    expect(r.shouldRollback).toBe(false)
    expect(r.hint).toMatch(/예상 밖|다른 값/)
  })

  it('기대값과 일치하는데 금지 표현이 있으면 내용 문제다', () => {
    const r = classifyVerifyOutcome({ ...zero, matched: 47, violation: 3 })
    expect(r.outcome).toBe('CONTENT_VIOLATION')
    expect(r.shouldRollback).toBe(true)
  })

  it('요청 실패는 캐시 문제와 구분한다', () => {
    expect(classifyVerifyOutcome({ ...zero, matched: 40, fetchFailed: 10 }).outcome)
      .toBe('FETCH_FAILED')
  })

  it('대기 건이 있을 때 안내가 반드시 나온다 (이전 조건문 버그)', () => {
    expect(classifyVerifyOutcome({ ...zero, matched: 49, pending: 1 }, 'after').hint).toBeTruthy()
  })

  it('진짜 위반이 있으면 대기 건이 있어도 위반이 우선한다', () => {
    const r = classifyVerifyOutcome({ ...zero, matched: 40, pending: 9, violation: 1 })
    expect(r.outcome).toBe('CONTENT_VIOLATION')
  })
})

// ── 추가: direct-run 계약 ────────────────────────────────────
describe('추가 — import 만으로는 아무 일도 일어나지 않는다', () => {
  it('두 CLI 를 import 해도 HTTP 요청이 0건이다', async () => {
    const calls: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL) => {
      calls.push(String(input))
      return Promise.reject(new Error('테스트 중 실제 요청 금지'))
    }) as typeof fetch
    try {
      const apply = await import('../../scripts/seo-desc-apply')
      const verify = await import('../../scripts/seo-desc-verify-production')
      // vitest 실행 중이므로 argv[1] 이 스크립트 경로가 아니다 → 실행되지 않아야 한다
      expect(apply.isDirectRun()).toBe(false)
      expect(verify.isDirectRun()).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(calls).toEqual([])
  })

  it('direct-run 판정은 argv[1] 로만 한다', async () => {
    const verify = await import('../../scripts/seo-desc-verify-production')
    const saved = process.argv[1]
    try {
      process.argv[1] = '/some/path/scripts/seo-desc-verify-production.ts'
      expect(verify.isDirectRun()).toBe(true)
      process.argv[1] = '/some/path/vitest.mjs'
      expect(verify.isDirectRun()).toBe(false)
    } finally {
      process.argv[1] = saved
    }
  })
})

// ── 추가: 로그 비식별 ────────────────────────────────────────
describe('추가 — 로그에 원본 post id 를 찍지 않는다', () => {
  it('fingerprint 는 입력을 복원할 수 없는 해시다', async () => {
    const { fingerprint } = await import('@/lib/seo/desc-apply-plan')
    const id = 'cmocutg680000ij3fwtp7qgab'
    const fp = fingerprint(id)
    expect(fp).toHaveLength(10)
    expect(fp).not.toContain(id.slice(0, 6))
    expect(fingerprint(id)).toBe(fp)          // 결정적
    expect(fingerprint(id + 'x')).not.toBe(fp) // 충돌 아님
  })
})
