import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * R6-E — `coo:moderator` false-green 회귀 테스트.
 *
 * 사고: GitHub Actions 는 3회 연속 success 였는데 실제로는 모더레이션이 **끝나지 않았다.**
 * 세 실행 로그 모두 `[Runner] coo:moderator 시작` 만 있고 `[COO] 모더레이션: ...` 완료 줄이 없었다.
 *
 * 원인은 Promise 를 아무도 들고 있지 않았던 것이다.
 *   · moderator.ts 가 top-level 에서 `agent.execute().then(...)` 을 **시작만** 하고 반환하지 않았다
 *   · runner 의 핸들러가 `import(...).then(() => {})` 이라 **모듈 로드까지만** 기다렸다
 *   · runner 는 곧바로 `disconnect()` 후 `process.exit(0)` — 판정이 중간에 잘렸다
 *
 * 초록불이 "작업 완료"를 뜻하지 않는 상태였다. 여기서 그 계약을 고정한다.
 *
 * DB 는 건드리지 않는다 — prisma·notifier·BaseAgent 를 전부 mock 해서 Promise 생명주기만 본다.
 */

const executeMock = vi.fn()

vi.mock('../core/db.js', () => ({
  prisma: {},
  disconnect: vi.fn(async () => {}),
}))
vi.mock('../core/notifier.js', () => ({ notifyAdmin: vi.fn(async () => {}) }))
vi.mock('../core/agent.js', () => ({
  BaseAgent: class {
    execute = executeMock
    protected async run() {
      return { agent: 'x', success: true, summary: '' }
    }
    protected async chat() {
      return 'KEEP'
    }
  },
}))

async function loadModerator() {
  return import('../coo/moderator.js')
}

describe('coo:moderator — Promise 생명주기 계약', () => {
  beforeEach(() => {
    vi.resetModules()
    executeMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('모듈을 import 하는 것만으로 execute 가 시작되지 않는다', async () => {
    // 예전에는 import 부작용으로 실행이 시작됐고, 그래서 아무도 완료를 기다릴 수 없었다.
    // (vitest 의 argv[1] 은 moderator 가 아니므로 direct-run guard 가 걸리지 않는다)
    executeMock.mockResolvedValue({ agent: 'COO_MODERATE', success: true, summary: '숨김 0건' })

    await loadModerator()

    expect(executeMock, 'import 만으로 실행되면 안 된다').not.toHaveBeenCalled()
  })

  it('main() 은 execute 가 끝나기 전에는 resolve 되지 않는다', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    executeMock.mockReturnValue(pending)

    const { main } = await loadModerator()

    let settled = false
    const running = main().then(() => {
      settled = true
    })

    // execute 가 아직 진행 중인 동안에는 main 도 끝나면 안 된다
    await Promise.resolve()
    await Promise.resolve()
    expect(settled, 'execute 진행 중인데 main 이 먼저 끝났다').toBe(false)

    release({ agent: 'COO_MODERATE', success: true, summary: '숨김 2건, AI 리뷰 5건' })
    await running
    expect(settled).toBe(true)
  })

  it('완료 로그는 성공했을 때만 남는다', async () => {
    executeMock.mockResolvedValue({ agent: 'COO_MODERATE', success: true, summary: '숨김 2건, AI 리뷰 5건' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { main } = await loadModerator()
    await main()

    const logged = logSpy.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('[COO] 모더레이션:'))
    expect(logged, '완료 로그가 있어야 한다').toBeDefined()
    expect(logged).toContain('숨김 2건, AI 리뷰 5건')
  })

  it('execute 가 success:false 면 main 이 reject 된다 — runner 의 exit 1 경로', async () => {
    // BaseAgent.execute 는 run() 의 에러를 삼키고 success:false 로 돌려준다.
    // 그대로 두면 모더레이션이 실패해도 exit 0 이라 또 초록불이 된다.
    executeMock.mockResolvedValue({
      agent: 'COO_MODERATE',
      success: false,
      summary: 'DB 연결 실패',
      error: 'DB 연결 실패',
    })

    const { main } = await loadModerator()
    await expect(main()).rejects.toThrow(/모더레이션 실패.*DB 연결 실패/)
  })

  it('실패했을 때는 완료 로그를 남기지 않는다', async () => {
    executeMock.mockResolvedValue({ agent: 'COO_MODERATE', success: false, summary: 'x', error: 'x' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { main } = await loadModerator()
    await main().catch(() => {})

    const logged = logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[COO] 모더레이션:'))
    expect(logged, '실패했는데 완료 로그가 남으면 사고가 반복된다').toEqual([])
  })

  it('execute 가 reject 해도 main 이 그대로 전파한다', async () => {
    executeMock.mockRejectedValue(new Error('예상 못 한 폭발'))

    const { main } = await loadModerator()
    await expect(main()).rejects.toThrow('예상 못 한 폭발')
  })
})

describe('runner 등록 형태 — 정적 검사', () => {
  const runnerSrc = readFileSync(resolve(__dirname, '../cron/runner.ts'), 'utf-8')

  it("coo:moderator 는 m.main() 을 반환한다", () => {
    // `.then(() => {})` 로 되돌아가면 runner 가 import 만 기다리고 작업을 잘라 버린다.
    const line = runnerSrc.split('\n').find((l) => l.includes("'coo:moderator':"))
    expect(line, 'coo:moderator 등록을 찾지 못했다').toBeDefined()
    expect(line).toContain('m.main()')
    expect(line, 'then(() => {}) 은 완료를 기다리지 않는다').not.toContain('then(() => {})')
  })

  it('direct-run 판별이 부분일치가 아니라 정확한 경로 비교다', () => {
    // `includes('moderator')` 는 경로에 그 단어가 든 다른 진입점에서도 참이 되어
    // runner 경로에서까지 이중 실행될 수 있다.
    const src = readFileSync(resolve(__dirname, '../coo/moderator.ts'), 'utf-8')
    // 주석에는 그 표현이 설명으로 등장하므로 **코드 줄만** 본다.
    const code = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n')
    expect(code, '부분일치 판별이 코드에 남아 있다').not.toContain("includes('moderator')")
    expect(code).toMatch(/resolve\(entry\)\s*===\s*fileURLToPath\(import\.meta\.url\)/)
  })

  it('moderator.ts 는 top-level 에서 execute 를 시작하지 않는다', () => {
    const src = readFileSync(resolve(__dirname, '../coo/moderator.ts'), 'utf-8')
    const topLevelStart = /^\s*agent\.execute\(\)/m
    expect(topLevelStart.test(src), 'top-level 실행이 남아 있으면 import 부작용이 되살아난다').toBe(false)
    expect(src).toContain('export async function main()')
  })
})
