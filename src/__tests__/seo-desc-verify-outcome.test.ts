/**
 * production HTML 검증 판정 — **구현보다 먼저 쓴 실패 테스트**.
 *
 * 이 파일이 막는 사고는 하나다:
 * **캐시가 아직 안 내려가 옛 문구가 보이는 것을 "내용 위반"으로 읽고 롤백하는 것.**
 *
 * 확정 CSV 실측: 적용 대상 50건 중 `currentSeoDescription` 에 미승인 금지 표현이
 * 있는 행이 **48**, `proposedSeoDescription` 에 있는 행은 **0** 이다.
 * 즉 적용 직후 캐시가 안 내려간 상태에서 HTML 을 읽으면 48건에서 금지어가 나온다.
 * 그것은 **정상적인 중간 상태**이지 롤백 사유가 아니다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCsv, toRewriteRows, buildPlan, detectDrift } from '@/lib/seo/desc-apply-plan'
import {
  unapprovedBanned, observeUrl, aggregate, classifyVerifyOutcome, createTracker,
  type UrlObservation,
} from '@/lib/seo/desc-verify'

const CSV = resolve(process.cwd(), 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv')
const rows = toRewriteRows(parseCsv(readFileSync(CSV, 'utf8')))
const plan = buildPlan(rows, 'apply')
const byId = new Map(rows.map((r) => [r.id, r]))
const targets = plan.targets

/** 확정 CSV 의 전제 — 이게 깨지면 아래 테스트의 의미도 달라진다 */
describe('확정 CSV 계약', () => {
  it('current 48건에 미승인 금지 표현이 있고 proposed 에는 0건이다', () => {
    const el = targets.map((t) => byId.get(t.id)!)
    expect(el).toHaveLength(50)
    expect(el.filter((r) => unapprovedBanned(r.currentSeoDescription).length)).toHaveLength(48)
    expect(el.filter((r) => unapprovedBanned(r.proposedSeoDescription).length)).toHaveLength(0)
  })
})

/** 한 라운드 관측을 만든다. html 을 직접 지정한다. */
function observeAll(mode: 'after' | 'before', html: (t: typeof targets[number]) => string | null): UrlObservation[] {
  return targets.map((t) => {
    const body = html(t)
    return observeUrl({
      id: t.id,
      mode,
      currentValue: t.expectedSeoDescription,   // apply 모드 plan → current
      proposedValue: t.nextSeoDescription,
      html: body,
      status: body === null ? 500 : 200,
    })
  })
}

describe('P0-1 — after 모드에서 옛 문구가 보이면 CACHE_PENDING 이다', () => {
  it('48건의 금지 표현이 있어도 CONTENT_VIOLATION 이 아니다', () => {
    const obs = observeAll('after', (t) => t.expectedSeoDescription)  // 아직 옛 값
    const v = classifyVerifyOutcome(aggregate(obs), 'after')
    expect(v.outcome).toBe('CACHE_PENDING')
    expect(v.shouldRollback).toBe(false)
  })

  it('옛 값 구간에서는 내용 검사를 아예 하지 않는다', () => {
    const obs = observeAll('after', (t) => t.expectedSeoDescription)
    expect(obs.every((o) => o.state === 'PENDING')).toBe(true)
    expect(obs.every((o) => o.banned.length === 0)).toBe(true)
  })

  it('일부만 반영된 중간 상태도 CACHE_PENDING 이다', () => {
    const obs = observeAll('after', (t) =>
      targets.indexOf(t) < 30 ? t.nextSeoDescription : t.expectedSeoDescription)
    const v = classifyVerifyOutcome(aggregate(obs), 'after')
    expect(v.outcome).toBe('CACHE_PENDING')
    expect(v.shouldRollback).toBe(false)
  })
})

describe('P0-2 — before 모드에서 옛 문구 정확 일치는 롤백 완료(OK)다', () => {
  it('48건의 금지 표현을 다시 위반으로 세지 않는다', () => {
    const obs = targets.map((t) => observeUrl({
      id: t.id, mode: 'before',
      currentValue: t.expectedSeoDescription,
      proposedValue: t.nextSeoDescription,
      html: t.expectedSeoDescription,   // 옛 값으로 정확히 복원됨
      status: 200,
    }))
    const v = classifyVerifyOutcome(aggregate(obs), 'before')
    expect(v.outcome).toBe('OK')
    expect(v.shouldRollback).toBe(false)
    expect(aggregate(obs).violation).toBe(0)
  })

  it('롤백 전이라 새 문구가 보이면 CACHE_PENDING 이다', () => {
    const obs = targets.map((t) => observeUrl({
      id: t.id, mode: 'before',
      currentValue: t.expectedSeoDescription,
      proposedValue: t.nextSeoDescription,
      html: t.nextSeoDescription,
      status: 200,
    }))
    const v = classifyVerifyOutcome(aggregate(obs), 'before')
    expect(v.outcome).toBe('CACHE_PENDING')
    expect(v.shouldRollback).toBe(false)
  })
})

describe('P0-3 — 기대값과 일치할 때만 내용 검사를 한다', () => {
  it('정상 반영 50/50 이면 OK 다', () => {
    const obs = observeAll('after', (t) => t.nextSeoDescription)
    const v = classifyVerifyOutcome(aggregate(obs), 'after')
    expect(v.outcome).toBe('OK')
    expect(aggregate(obs).matched).toBe(50)
  })

  it('proposed 정확 일치인데 금지어가 있으면 방어적으로 CONTENT_VIOLATION 이다', () => {
    const obs = observeAll('after', (t) =>
      targets.indexOf(t) === 0 ? '실버케어 채용 — 오염된 제안값' : t.nextSeoDescription)
    // 오염된 값이 proposed 와 다르므로 UNEXPECTED 여야 한다 (제안값은 깨끗하니까)
    expect(obs[0].state).toBe('UNEXPECTED')

    // 제안값 자체가 오염된 경우를 직접 만든다
    const poisoned = observeUrl({
      id: targets[0].id, mode: 'after',
      currentValue: '옛 문구',
      proposedValue: '실버케어 채용',
      html: '실버케어 채용',
      status: 200,
    })
    expect(poisoned.state).toBe('VIOLATION')
    expect(poisoned.banned).toEqual(['실버'])
    const v = classifyVerifyOutcome(aggregate([poisoned]), 'after')
    expect(v.outcome).toBe('CONTENT_VIOLATION')
    expect(v.shouldRollback).toBe(true)
  })

  it('승인된 공식 직함은 위반이 아니다', () => {
    const o = observeUrl({
      id: 'x', mode: 'after',
      currentValue: '옛', proposedValue: '강원 노인요양원 취업 요양 복지사 모집',
      html: '강원 노인요양원 취업 요양 복지사 모집', status: 200,
    })
    expect(o.state).toBe('MATCHED')
    expect(o.banned).toEqual([])
  })

  it('current 도 proposed 도 아닌 값은 UNEXPECTED 로 구분한다', () => {
    const o = observeUrl({
      id: 'x', mode: 'after',
      currentValue: '옛', proposedValue: '새', html: '누가 딴 걸 써넣었다', status: 200,
    })
    expect(o.state).toBe('UNEXPECTED')
  })

  it('요청 실패는 따로 센다', () => {
    const o = observeUrl({ id: 'x', mode: 'after', currentValue: '옛', proposedValue: '새', html: null, status: 503 })
    expect(o.state).toBe('FETCH_FAILED')
    expect(classifyVerifyOutcome(aggregate([o]), 'after').outcome).toBe('FETCH_FAILED')
  })
})

describe('P0-4 — 앞 라운드의 실제 위반이 뒤 라운드에서 사라지지 않는다', () => {
  it('terminal 위반은 누적되고 덮이지 않는다', () => {
    const tracker = createTracker(targets.map((t) => t.id))

    // 라운드 1 — 1건이 오염된 제안값으로 정확히 일치(진짜 위반), 나머지는 아직 옛 값
    tracker.record([
      observeUrl({ id: targets[0].id, mode: 'after', currentValue: '옛', proposedValue: '실버케어', html: '실버케어', status: 200 }),
      ...targets.slice(1).map((t) => observeUrl({
        id: t.id, mode: 'after',
        currentValue: t.expectedSeoDescription, proposedValue: t.nextSeoDescription,
        html: t.expectedSeoDescription, status: 200,
      })),
    ])
    expect(tracker.snapshot().violation).toBe(1)

    // 라운드 2 — 위반 URL 은 이미 terminal 이라 다시 치지 않는다
    expect(tracker.pending()).not.toContain(targets[0].id)

    // 나머지가 전부 반영돼도 위반은 그대로 남는다
    tracker.record(targets.slice(1).map((t) => observeUrl({
      id: t.id, mode: 'after',
      currentValue: t.expectedSeoDescription, proposedValue: t.nextSeoDescription,
      html: t.nextSeoDescription, status: 200,
    })))
    const snap = tracker.snapshot()
    expect(snap.violation).toBe(1)
    expect(snap.matched).toBe(49)
    expect(classifyVerifyOutcome(snap, 'after').outcome).toBe('CONTENT_VIOLATION')
  })

  it('MATCHED 도 terminal 이라 다시 조회하지 않는다', () => {
    const tracker = createTracker(['a', 'b'])
    tracker.record([
      observeUrl({ id: 'a', mode: 'after', currentValue: '옛', proposedValue: '새', html: '새', status: 200 }),
      observeUrl({ id: 'b', mode: 'after', currentValue: '옛', proposedValue: '새', html: '옛', status: 200 }),
    ])
    expect(tracker.pending()).toEqual(['b'])
    expect(tracker.snapshot().matched).toBe(1)
  })
})

describe('P1 — 로그에 원본 post id 가 나오지 않는다', () => {
  it('buildPlan 의 모든 issue detail 에 CUID 가 없다', () => {
    const broken = rows.map((r, i) =>
      i < 3 ? { ...r, proposedSeoDescription: r.currentSeoDescription } : r)
    const p = buildPlan(broken, 'apply')
    expect(p.ok).toBe(false)
    const ids = rows.map((r) => r.id)
    for (const issue of p.issues) {
      for (const id of ids) expect(issue.detail).not.toContain(id)
    }
    expect(p.issues.some((i) => /post#[0-9a-f]{10}/.test(i.detail))).toBe(true)
  })

  it('detectDrift 의 모든 issue detail 에 CUID 가 없다', () => {
    const live = targets.map((t) => ({
      id: t.id, boardType: 'MAGAZINE', status: 'HIDDEN',
      seoTitle: '바뀐 제목', seoDescription: '바뀐 문구',
    }))
    const d = detectDrift(targets, [...live, { ...live[0], id: 'cmzzzzzzzzzzzzzzzzzzzzzzz' }])
    expect(d.ok).toBe(false)
    for (const issue of d.issues) {
      for (const t of targets) expect(issue.detail).not.toContain(t.id)
      expect(issue.detail).not.toContain('cmzzzzzzzzzzzzzzzzzzzzzzz')
    }
  })
})
