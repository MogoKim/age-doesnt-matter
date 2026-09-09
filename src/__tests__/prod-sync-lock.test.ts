import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCK_TARGETS, MARKER, planInstalls, reconcile, sha } from '../../scripts/lock-sync.mjs'

/**
 * `unao-prod-sync` 의존성 동기화 회귀 테스트 — 2026-09-09.
 *
 * 사고 형태: 동기화 job 이 `git pull --ff-only` 만 해서 package-lock 이 바뀌어도
 * 운영 clone 의 node_modules 는 옛 상태로 남았다. 실측으로 재현했다 —
 * unao-prod 가 lock 최신(9793ee63)인데 PR-F 에서 추가한 `yaml` 이 설치돼 있지 않았다.
 * **새 코드 + 옛 의존성** 이 조용히 도는 상태다.
 *
 * 고정하는 계약은 넷이다.
 *   ① root 와 agents 두 lock 을 **모두** 본다
 *   ② 마커가 없으면 설치한다 (지금 unao-prod 가 그 상태다)
 *   ③ lock 이 바뀌면 설치한다 / 같으면 건너뛴다
 *   ④ `npm ci` 가 실패하면 **마커를 쓰지 않고 실패로 보고**한다 — 조용히 넘어가면 사고가 돌아온다
 */

type Io = {
  existsSync: (p: string) => boolean
  readFileSync: (p: string, enc?: string) => string
  writeFileSync: (p: string, data: string) => void
}

/** 메모리 파일시스템 — 실제 디스크·npm 을 건드리지 않는다. */
function makeIo(files: Record<string, string>): Io & { files: Record<string, string> } {
  return {
    files,
    existsSync: (p) => p in files,
    readFileSync: (p) => files[p],
    writeFileSync: (p, data) => { files[p] = data },
  }
}

const TREE = '/tmp/tree'
const rootLock = join(TREE, 'package-lock.json')
const rootMarker = join(TREE, 'node_modules', MARKER)
const agentsLock = join(TREE, 'agents', 'package-lock.json')
const agentsMarker = join(TREE, 'agents', 'node_modules', MARKER)

describe('planInstalls — 무엇을 다시 설치해야 하는가', () => {
  it('root 와 agents 두 lock 을 모두 본다', () => {
    expect(LOCK_TARGETS.map((t: { name: string }) => t.name)).toEqual(['root', 'agents'])
  })

  it('마커가 없으면 설치 대상이다 (지금 unao-prod 의 상태)', () => {
    const io = makeIo({ [rootLock]: '{"v":1}', [agentsLock]: '{"v":1}' })
    const plan = planInstalls(TREE, io)
    expect(plan.map((p: { reason: string }) => p.reason)).toEqual(['no-marker', 'no-marker'])
  })

  it('lock 이 바뀌면 설치 대상이다', () => {
    const io = makeIo({
      [rootLock]: '{"v":2}', [rootMarker]: sha('{"v":1}'),
      [agentsLock]: '{"v":1}', [agentsMarker]: sha('{"v":1}'),
    })
    const plan = planInstalls(TREE, io)
    expect(plan[0].reason, 'root lock 이 바뀌었다').toBe('lock-changed')
    expect(plan[1].reason, 'agents lock 은 그대로다').toBe('ok')
  })

  it('lock 이 그대로면 건너뛴다 — 매번 npm ci 를 돌리지 않는다', () => {
    const body = '{"v":1}'
    const io = makeIo({
      [rootLock]: body, [rootMarker]: sha(body),
      [agentsLock]: body, [agentsMarker]: sha(body),
    })
    expect(planInstalls(TREE, io).map((p: { reason: string }) => p.reason)).toEqual(['ok', 'ok'])
  })

  it('lock 파일 자체가 없으면 대상이 아니다', () => {
    expect(planInstalls(TREE, makeIo({})).map((p: { reason: string }) => p.reason))
      .toEqual(['no-lock', 'no-lock'])
  })
})

describe('reconcile — 설치와 실패 전파', () => {
  it('설치 성공 시에만 마커를 남긴다', () => {
    const io = makeIo({ [rootLock]: '{"v":2}', [agentsLock]: '{"v":2}' })
    const calls: string[] = []
    const out = reconcile(TREE, (dir: string) => { calls.push(dir); return 0 }, io)

    expect(out.installed).toEqual(['root', 'agents'])
    expect(out.failed).toEqual([])
    expect(calls).toEqual([TREE, join(TREE, 'agents')])
    expect(io.files[rootMarker]).toBe(sha('{"v":2}'))
  })

  it('★ npm ci 가 실패하면 마커를 쓰지 않고 실패로 보고한다', () => {
    // 마커를 남기면 다음 실행이 "최신"으로 착각해 사고가 그대로 돌아온다.
    const io = makeIo({ [rootLock]: '{"v":2}', [agentsLock]: '{"v":2}' })
    const out = reconcile(TREE, () => 1, io)

    expect(out.installed).toEqual([])
    expect(out.failed).toEqual([{ name: 'root', code: 1 }, { name: 'agents', code: 1 }])
    expect(rootMarker in io.files, '실패했는데 마커가 남았다').toBe(false)
  })

  it('건너뛴 대상에는 npm ci 를 돌리지 않는다', () => {
    const body = '{"v":1}'
    const io = makeIo({
      [rootLock]: body, [rootMarker]: sha(body),
      [agentsLock]: '{"v":9}',
    })
    const calls: string[] = []
    const out = reconcile(TREE, (dir: string) => { calls.push(dir); return 0 }, io)
    expect(out.skipped).toEqual(['root'])
    expect(calls).toEqual([join(TREE, 'agents')])
  })
})

describe('launchd-wrapper 가 이 계약을 실제로 쓴다', () => {
  const src = readFileSync(join(__dirname, '../../scripts/launchd-wrapper.mjs'), 'utf-8')

  it('lock-sync 의 reconcile 을 import 한다', () => {
    expect(src).toContain("import { reconcile } from './lock-sync.mjs'")
  })

  it('git pull 이 성공했을 때만 돌린다 — 트리거를 넓히지 않는다', () => {
    expect(src).toContain("args.includes('pull')")
    expect(src).toMatch(/exitCode === 0 && isGitPull/)
  })

  it('npm ci 실패를 래퍼 실패로 전파한다 — 조용히 넘어가지 않는다', () => {
    const block = src.slice(src.indexOf('if (report.failed.length > 0)'))
    expect(block).toContain('exitCode = 1')
  })
})
