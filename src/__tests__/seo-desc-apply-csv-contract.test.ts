/**
 * 실제 CSV 계약 테스트.
 *
 * 위 단위 테스트는 가짜 행으로 로직을 본다. 이 파일은 **PR #468 이 확정한 진짜 CSV** 가
 * 도구의 전제를 계속 만족하는지 본다. 누군가 CSV 를 손대면 여기서 먼저 깨진다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  parseCsv, toRewriteRows, buildPlan, csvToDbValue,
  EXPECTED_TOTAL_ROWS, EXPECTED_APPLY_ROWS,
} from '@/lib/seo/desc-apply-plan'
import { unapprovedBanned } from '@/lib/seo/desc-verify'

const CSV = resolve(process.cwd(), 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv')
const rows = toRewriteRows(parseCsv(readFileSync(CSV, 'utf8')))

describe('확정 CSV 계약', () => {
  it(`전체 ${EXPECTED_TOTAL_ROWS}행이다`, () => {
    expect(rows).toHaveLength(EXPECTED_TOTAL_ROWS)
  })

  it(`계획이 통과하고 대상이 정확히 ${EXPECTED_APPLY_ROWS}건이다`, () => {
    const plan = buildPlan(rows, 'apply')
    expect(plan.issues).toEqual([])
    expect(plan.ok).toBe(true)
    expect(plan.targets).toHaveLength(EXPECTED_APPLY_ROWS)
    expect(new Set(plan.targets.map((t) => t.id)).size).toBe(EXPECTED_APPLY_ROWS)
  })

  it('사전조건 해시가 current 값과 일치한다', () => {
    const h = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)
    for (const r of rows) {
      expect(h(r.currentSeoTitle)).toBe(r.currentSeoTitleSha256_12)
      expect(h(r.currentSeoDescription)).toBe(r.currentSeoDescriptionSha256_12)
    }
  })

  it('적용 대상 제안 문구에 미승인 금지 표현이 없다', () => {
    const plan = buildPlan(rows, 'apply')
    const ids = new Set(plan.targets.map((t) => t.id))
    const hit = rows
      .filter((r) => ids.has(r.id))
      .filter((r) => unapprovedBanned(r.proposedSeoDescription).length)
      .map((r) => r.id)
    expect(hit).toEqual([])
  })

  it('보류 9건은 대상에서 빠져 있다', () => {
    const plan = buildPlan(rows, 'apply')
    const ids = new Set(plan.targets.map((t) => t.id))
    const held = rows.filter((r) => r.applyEligible === 'false')
    expect(held).toHaveLength(9)
    for (const r of held) expect(ids.has(r.id)).toBe(false)
  })

  it('적용 대상은 전부 JOB 이고 제안 문구가 현재 문구와 다르다', () => {
    for (const r of rows.filter((r) => r.applyEligible === 'true')) {
      expect(r.boardType).toBe('JOB')
      expect(csvToDbValue(r.proposedSeoDescription)).not.toBe(csvToDbValue(r.currentSeoDescription))
    }
  })
})
