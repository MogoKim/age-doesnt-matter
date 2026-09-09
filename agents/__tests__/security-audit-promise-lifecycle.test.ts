import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * R4 최종 정리 — `cto:security-audit` 의 Promise 생명주기 계약 (2026-09-09).
 *
 * 이 감사는 **어드민 민감 액션(AdminAuditLog)·로그인 실패·BotLog 실패율**을 본다. 보안 경로라 남겼다.
 * 그런데 남기는 것만으로는 부족했다 — 예전 구조는 moderator 와 같은 false-green 이었다.
 *   · security-audit.ts 가 top-level 에서 `agent.execute().then(...)` 을 **시작만** 했고
 *   · runner 핸들러가 `import(...).then(() => {})` 이라 **모듈 로드까지만** 기다렸고
 *   · runner 는 곧바로 `disconnect()` + `process.exit()` — 감사가 첫 await 에서 잘렸다
 *
 * 즉 "보안 감사가 돌고 있다"는 초록불은 한 번도 사실이 아니었다.
 * 여기서 완료 전파와 실패 전파를 함께 고정한다.
 *
 * DB 는 건드리지 않는다 — prisma·notifier·BaseAgent 를 mock 해서 생명주기만 본다.
 */

const executeMock = vi.fn()

vi.mock('../core/db.js', () => ({ prisma: {}, disconnect: vi.fn(async () => {}) }))
vi.mock('../core/notifier.js', () => ({
  notifyAdmin: vi.fn(async () => {}),
  notifySlack: vi.fn(async () => {}),
}))
vi.mock('../core/agent.js', () => ({
  BaseAgent: class {
    execute = executeMock
    protected async run() {
      return { agent: 'x', success: true, summary: '' }
    }
  },
}))

const loadAudit = () => import('../cto/security-audit.js')

describe('cto:security-audit — Promise 생명주기 계약', () => {
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
    executeMock.mockResolvedValue({ agent: 'CTO_SECURITY', success: true, summary: '보안 감사 완료' })
    await loadAudit()
    expect(executeMock, 'import 부작용으로 실행되면 아무도 완료를 기다릴 수 없다').not.toHaveBeenCalled()
  })

  it('main() 은 execute 가 끝나기 전에는 resolve 되지 않는다', async () => {
    let release: (v: unknown) => void = () => {}
    executeMock.mockReturnValue(new Promise((r) => { release = r }))

    const { main } = await loadAudit()
    let settled = false
    const running = main().then(() => { settled = true })

    await Promise.resolve()
    expect(settled, '감사가 끝나기 전에 완료로 보고되면 false-green 이다').toBe(false)

    release({ agent: 'CTO_SECURITY', success: true, summary: '보안 감사 완료 [OK]: 0건 발견' })
    await running
    expect(settled).toBe(true)
  })

  it('execute 가 실패하면 main() 이 reject 한다 — runner 가 exit 1 로 받는다', async () => {
    executeMock.mockRejectedValue(new Error('DB 연결 실패'))
    const { main } = await loadAudit()
    await expect(main(), '실패가 삼켜지면 초록불로 배포된다').rejects.toThrow('DB 연결 실패')
  })
})

describe('runner 가 security-audit 의 완료를 기다린다', () => {
  const runnerSrc = readFileSync(resolve(__dirname, '../cron/runner.ts'), 'utf-8')

  it("핸들러가 `.then(() => {})` 가 아니라 main() 을 반환한다", () => {
    // MONITORING_TASKS 목록에도 같은 키가 있으므로 **핸들러 정의 줄**만 고른다.
    const line = runnerSrc.split('\n').find((l) => /^\s{2}'cto:security-audit':/.test(l))
    expect(line, 'security-audit 핸들러가 사라졌다').toBeDefined()
    expect(line, 'import 만 기다리면 감사가 중간에 잘린다').toContain('m.main()')
  })

  it('seo-snapshot 외에 `.then(() => {})` 핸들러가 남아 있지 않다', () => {
    // seo-snapshot 만 예외다 — 모듈이 top-level `await main()` 이라 import() 가 완료까지 기다린다.
    const offenders = runnerSrc
      .split('\n')
      .filter((l) => /^\s{2}'[a-z_]+:[a-z-]+':/.test(l) && l.includes('.then(() => {})'))
      .filter((l) => !l.includes('seo-snapshot'))
    expect(offenders, 'Promise 를 반환하지 않는 핸들러는 완료 전에 프로세스가 죽는다').toEqual([])
  })
})
