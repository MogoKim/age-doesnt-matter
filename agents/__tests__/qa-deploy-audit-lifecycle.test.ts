import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * R6 P0 — `qa:deploy-audit` false-green 제거.
 *
 * Gate 2 는 두 방향으로 거짓말을 하고 있었다.
 *   · `automation_status=PAUSED` 라 runner 가 **핸들러 진입 전에 스킵**했는데도
 *     워크플로우는 success 였다 — 배포가 무검증으로 나가는데 초록불이었다.
 *   · 실행되더라도 top-level `main()` fire-and-forget + 모듈이 직접 `process.exit` 이라
 *     runner 가 완료를 기다릴 수도, exit code 를 정할 수도 없었다.
 *
 * 여기에 더해 Gate 2 는 **감사면서 사용자 콘텐츠를 고쳤다**(`prisma.post.update` JSON unwrap).
 * 배포 감사가 게시글을 말없이 바꾸면 무엇이 원본이었는지 아무도 모른다.
 * 이제 검사·기록·알림만 하고, 발견한 문제는 check 결과와 AdminQueue 로 올린다.
 *
 * DB 는 전부 mock 한다 — 실제 write 는 한 건도 일으키지 않는다.
 */

const postFindMany = vi.fn()
const postUpdate = vi.fn()
const botLogFindFirst = vi.fn()
const botLogCreate = vi.fn()
const adminQueueCreate = vi.fn()
const sendSlackMessage = vi.fn()
const disconnect = vi.fn()

vi.mock('../core/db.js', () => ({
  prisma: {
    post: { findMany: (...a: unknown[]) => postFindMany(...a), update: (...a: unknown[]) => postUpdate(...a) },
    botLog: { findFirst: (...a: unknown[]) => botLogFindFirst(...a), create: (...a: unknown[]) => botLogCreate(...a) },
    adminQueue: { create: (...a: unknown[]) => adminQueueCreate(...a) },
  },
  disconnect: (...a: unknown[]) => disconnect(...a),
}))
vi.mock('../core/notifier.js', () => ({ sendSlackMessage: (...a: unknown[]) => sendSlackMessage(...a) }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn(async () => ({ content: [{ type: 'text', text: 'PASS' }] })) }
  },
}))

async function loadAudit() {
  return import('../qa/post-deploy.js')
}

/** 모든 필수 결과 파일이 없는 상태 = 검사 불가 → FAIL 이 기대값이다. */
beforeEach(() => {
  vi.resetModules()
  for (const m of [postFindMany, postUpdate, botLogFindFirst, botLogCreate, adminQueueCreate, sendSlackMessage, disconnect]) {
    m.mockReset()
  }
  postFindMany.mockResolvedValue([])
  botLogFindFirst.mockResolvedValue(null)
  botLogCreate.mockResolvedValue({ id: 1 })
  adminQueueCreate.mockResolvedValue({ id: 42 })
  sendSlackMessage.mockResolvedValue(undefined)
  disconnect.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Promise 생명주기', () => {
  it('모듈 import 만으로 감사가 시작되지 않는다', async () => {
    await loadAudit()
    expect(botLogCreate, 'import 부작용으로 실행되면 안 된다').not.toHaveBeenCalled()
    expect(sendSlackMessage).not.toHaveBeenCalled()
  })

  it('main() 은 기록이 끝나기 전에 resolve 되지 않는다', async () => {
    let release: () => void = () => {}
    botLogCreate.mockReturnValue(new Promise<void>((r) => { release = r }))

    const { main } = await loadAudit()
    let settled = false
    const running = main().catch(() => {}).then(() => { settled = true })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled, 'BotLog 기록 중인데 main 이 먼저 끝났다').toBe(false)

    release()
    await running
    expect(settled).toBe(true)
  })

  it('main 은 process.exit 도 disconnect 도 하지 않는다 — runner 담당', async () => {
    const { main } = await loadAudit()
    await main().catch(() => {})
    expect(disconnect, 'imported main 이 연결을 끊으면 runner 가 쓸 수 없다').not.toHaveBeenCalled()
  })
})

describe('실패 정책', () => {
  it('필수 결과가 없으면 성공으로 둔갑하지 않고 FAIL 로 reject 된다', async () => {
    // 결과 파일이 없으면 "검사를 못 한 것"이지 통과가 아니다.
    // 예전에는 워크플로우 outcome(QA_SMOKE_RESULT=success)으로 대체해 초록불이 났다.
    process.env.QA_SMOKE_RESULT = 'success'
    process.env.QA_CRON_RESULT = 'success'
    process.env.QA_AD_VERIFY_RESULT = 'success'

    const { main } = await loadAudit()
    await expect(main()).rejects.toThrow(/FAIL/)
  })

  it('FAIL 이면 AdminQueue 에 올린다', async () => {
    const { main } = await loadAudit()
    await main().catch(() => {})
    expect(adminQueueCreate).toHaveBeenCalledTimes(1)
  })

  it('Slack 실패는 비치명이고 BotLog 는 계속 시도한다', async () => {
    // 예전에는 Slack 과 BotLog 가 같은 try 라서 Slack 이 죽으면 기록까지 통째로 건너뛰었다.
    sendSlackMessage.mockRejectedValue(new Error('slack down'))

    const { main } = await loadAudit()
    await main().catch(() => {})

    expect(botLogCreate, 'Slack 이 죽어도 BotLog 는 남아야 한다').toHaveBeenCalledTimes(1)
  })

  it('AdminQueue 실패에도 BotLog 기록을 시도한다', async () => {
    adminQueueCreate.mockRejectedValue(new Error('queue down'))

    const { main } = await loadAudit()
    await expect(main()).rejects.toThrow(/AdminQueue 등록 실패/)
    expect(botLogCreate, 'AdminQueue 가 죽어도 기록은 남겨야 한다').toHaveBeenCalledTimes(1)
  })

  it('BotLog 실패는 치명이다 — 기록이 없으면 감사가 없던 일이 된다', async () => {
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main()).rejects.toThrow(/BotLog 기록 실패/)
  })

  it('치명 오류가 여러 개면 모두 시도한 뒤 합쳐서 던진다', async () => {
    adminQueueCreate.mockRejectedValue(new Error('queue down'))
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main()).rejects.toThrow(/치명 오류 2건/)
    expect(adminQueueCreate).toHaveBeenCalled()
    expect(botLogCreate).toHaveBeenCalled()
  })
})

describe('콘텐츠 write 차단', () => {
  it('Gate 2 는 게시글을 수정하지 않는다', async () => {
    postFindMany.mockResolvedValue([
      { id: 'p1', title: 'JSON 래핑된 글', content: '```json\n{"a":1}\n```', thumbnailUrl: null },
      { id: 'p2', title: 'placeholder 글', content: '이미지를 넣어주세요', thumbnailUrl: null },
    ])

    const { main } = await loadAudit()
    await main().catch(() => {})

    expect(postUpdate, '감사가 콘텐츠를 말없이 바꾸면 원본을 아무도 모른다').not.toHaveBeenCalled()
  })

  it('소스에 post.update 호출이 남아 있지 않다', () => {
    const src = readFileSync(resolve(__dirname, '../qa/post-deploy.ts'), 'utf-8')
    const code = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/prisma\.post\.update/)
  })
})

describe('runner 배선 — 정적 검사', () => {
  const runnerSrc = readFileSync(resolve(__dirname, '../cron/runner.ts'), 'utf-8')

  it('qa:deploy-audit 핸들러가 m.main() 을 반환한다', () => {
    const line = runnerSrc.split('\n').find((l) => l.includes("'qa:deploy-audit':"))
    expect(line, '핸들러 등록을 찾지 못했다').toBeDefined()
    expect(line).toContain('m.main()')
    expect(line, 'then(() => {}) 은 완료를 기다리지 않는다').not.toContain('then(() => {})')
  })

  it('MONITORING_TASKS 에 포함돼 PAUSED 에서도 실행된다', () => {
    const block = runnerSrc.slice(
      runnerSrc.indexOf('const MONITORING_TASKS'),
      runnerSrc.indexOf('const HANDLERS'),
    )
    expect(block).toContain("'qa:deploy-audit'")
  })

  it('post-deploy.ts 는 top-level 에서 main 을 부르지 않는다', () => {
    const src = readFileSync(resolve(__dirname, '../qa/post-deploy.ts'), 'utf-8')
    expect(/^main\(\)/m.test(src), 'import 부작용이 되살아난다').toBe(false)
    expect(src).toContain('export async function main()')
    expect(src).toMatch(/pathResolve\(entry\)\s*===\s*fileURLToPath\(import\.meta\.url\)/)
  })
})
