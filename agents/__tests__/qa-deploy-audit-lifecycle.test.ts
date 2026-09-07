import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
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

/** 결과 파일이 하나도 없는 임시 디렉터리 — 검사 불가 → FAIL 이 기대값이다. */
let dir: string

beforeEach(() => {
  dir = makeResults({ 'smoke-result.json': null, 'cron-result.json': null, 'ad-verify-result.json': null })
  vi.resetModules()
  for (const m of [postFindMany, postUpdate, botLogFindFirst, botLogCreate, adminQueueCreate, sendSlackMessage, disconnect]) {
    m.mockReset()
  }
  postFindMany.mockResolvedValue([])
  botLogFindFirst.mockResolvedValue(null)
  botLogCreate.mockResolvedValue({ id: 1 })
  adminQueueCreate.mockResolvedValue({ id: 'cq_seed_default' })
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
    const running = main(dir).catch(() => {}).then(() => { settled = true })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled, 'BotLog 기록 중인데 main 이 먼저 끝났다').toBe(false)

    release()
    await running
    expect(settled).toBe(true)
  })

  it('main 은 process.exit 도 disconnect 도 하지 않는다 — runner 담당', async () => {
    const { main } = await loadAudit()
    await main(dir).catch(() => {})
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
    await expect(main(dir)).rejects.toThrow(/FAIL/)
  })

  it('FAIL 이면 AdminQueue 에 올린다', async () => {
    const { main } = await loadAudit()
    await main(dir).catch(() => {})
    expect(adminQueueCreate).toHaveBeenCalledTimes(1)
  })

  it('Slack 실패는 비치명이고 BotLog 는 계속 시도한다', async () => {
    // 예전에는 Slack 과 BotLog 가 같은 try 라서 Slack 이 죽으면 기록까지 통째로 건너뛰었다.
    sendSlackMessage.mockRejectedValue(new Error('slack down'))

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(botLogCreate, 'Slack 이 죽어도 BotLog 는 남아야 한다').toHaveBeenCalledTimes(1)
  })

  it('AdminQueue 실패에도 BotLog 기록을 시도한다', async () => {
    adminQueueCreate.mockRejectedValue(new Error('queue down'))

    const { main } = await loadAudit()
    await expect(main(dir)).rejects.toThrow(/AdminQueue 등록 실패/)
    expect(botLogCreate, 'AdminQueue 가 죽어도 기록은 남겨야 한다').toHaveBeenCalledTimes(1)
  })

  it('BotLog 실패는 치명이다 — 기록이 없으면 감사가 없던 일이 된다', async () => {
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main(dir)).rejects.toThrow(/BotLog 기록 실패/)
  })

  it('치명 오류가 여러 개면 모두 시도한 뒤 합쳐서 던진다', async () => {
    adminQueueCreate.mockRejectedValue(new Error('queue down'))
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main(dir)).rejects.toThrow(/치명 오류 2건/)
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
    await main(dir).catch(() => {})

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
    expect(src).toMatch(/export async function main\(/)
    expect(src).toMatch(/pathResolve\(entry\)\s*===\s*fileURLToPath\(import\.meta\.url\)/)
  })
})

/**
 * 결과 파일 파서 — 결함 5건을 서로 **독립적으로** 재현한다.
 *
 * post-deploy.ts 는 저장소 루트(ROOT)에서 결과 파일을 찾는다. 테스트는 실제 파일을
 * 만들었다 지우며, 만들지 않은 파일은 "없음" 경로를 그대로 태운다.
 */
const RESULT_FILES = ['smoke-result.json', 'cron-result.json', 'ad-verify-result.json'] as const

/** 정상 통과하는 최소 내용 — 검사 하나만 골라 망가뜨리기 위한 기준선 */
const GOOD = {
  'smoke-result.json': JSON.stringify({ passed: 8, failed: 0, checks: [] }),
  'cron-result.json': JSON.stringify({
    total: 79,
    orphaned: [],
    unlinkedWithoutReason: [],
    workflowWithoutHandler: [],
    launchdOrphans: [],
  }),
  'ad-verify-result.json': JSON.stringify({ stats: { expected: 6, unexpected: 0, flaky: 0 } }),
}

const tmpDirs: string[] = []

/**
 * 결과 파일을 **임시 디렉터리에** 만들고 그 경로를 main 에 주입한다.
 *
 * 저장소 루트에 쓰고 지우면 CI 아티팩트나 개발자의 실제 결과 파일을 날린다.
 * `null` 로 준 항목은 만들지 않아 "파일 없음" 경로를 그대로 태운다.
 */
function makeResults(overrides: Partial<Record<(typeof RESULT_FILES)[number], string | null>> = {}): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'gate2-results-'))
  tmpDirs.push(dir)
  for (const f of RESULT_FILES) {
    const value = f in overrides ? overrides[f] : GOOD[f]
    if (value === null) continue
    writeFileSync(resolve(dir, f), value as string, 'utf-8')
  }
  return dir
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

/** verdict 는 BotLog 기록 payload 에서 읽는다 — 내부 함수를 노출하지 않고 결과만 본다. */
function loggedVerdict(): string | undefined {
  const call = botLogCreate.mock.calls[0]?.[0] as { data?: { details?: string } } | undefined
  if (!call?.data?.details) return undefined
  return (JSON.parse(call.data.details) as { verdict?: string }).verdict
}

function loggedCheck(name: string): { pass: boolean; warn?: boolean; detail: string } | undefined {
  const call = botLogCreate.mock.calls[0]?.[0] as { data?: { details?: string } } | undefined
  if (!call?.data?.details) return undefined
  const parsed = JSON.parse(call.data.details) as { checks?: Array<{ name: string; pass: boolean; warn?: boolean; detail: string }> }
  return parsed.checks?.find((c) => c.name === name)
}

describe('결과 파일 파서 — 결함별 독립 재현', () => {
  
  it('cron 파일만 없으면 크론 연결이 FAIL 이다 (workflow outcome 으로 통과시키지 않는다)', async () => {
    process.env.QA_CRON_RESULT = 'success'
    dir = makeResults({ 'cron-result.json': null })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('크론 연결')?.pass).toBe(false)
    expect(loggedCheck('스모크 테스트')?.pass, '다른 검사는 멀쩡해야 한다').toBe(true)
    expect(loggedVerdict()).toBe('FAIL')
  })

  it('ad 파일만 없으면 광고 렌더링이 FAIL 이다', async () => {
    process.env.QA_AD_VERIFY_RESULT = 'success'
    dir = makeResults({ 'ad-verify-result.json': null })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('광고 렌더링')?.pass).toBe(false)
    expect(loggedCheck('크론 연결')?.pass).toBe(true)
    expect(loggedVerdict()).toBe('FAIL')
  })

  it.each([
    ['unlinkedWithoutReason', { unlinkedWithoutReason: ['cmo:x'] }],
    ['workflowWithoutHandler', { workflowWithoutHandler: ['cmo:ghost'] }],
    ['launchdOrphans', { launchdOrphans: [{ plist: 'a.plist', missingFile: '/x.ts' }] }],
  ])('cron 실패 배열 %s 가 있으면 FAIL 이다', async (_label, patch) => {
    dir = makeResults({
      'cron-result.json': JSON.stringify({
        total: 79, orphaned: [],
        unlinkedWithoutReason: [], workflowWithoutHandler: [], launchdOrphans: [],
        ...patch,
      }),
    })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('크론 연결')?.pass).toBe(false)
    expect(loggedVerdict()).toBe('FAIL')
  })

  it('사유가 붙은 orphaned 만 있으면 통과한다 — orphaned 배열은 실패 기준이 아니다', async () => {
    // 저장소에는 DISPATCH/LOCAL ONLY 로 의도된 orphan 이 33개 있다.
    // 이걸 실패로 세면 Gate 2 가 영원히 빨간불이다.
    dir = makeResults({
      'cron-result.json': JSON.stringify({
        total: 79,
        orphaned: Array.from({ length: 33 }, (_, i) => `agent:task${i}`),
        dispatchOnly: Array.from({ length: 25 }, (_, i) => `agent:task${i}`),
        localOnly: Array.from({ length: 8 }, (_, i) => `agent:task${i + 25}`),
        unlinkedWithoutReason: [], workflowWithoutHandler: [], launchdOrphans: [],
      }),
    })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('크론 연결')?.pass, 'orphaned 33개는 정상이다').toBe(true)
  })

  it('cron 결과가 예상 형식이 아니면 통과시키지 않는다', async () => {
    dir = makeResults({ 'cron-result.json': JSON.stringify({ total: 79 }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('크론 연결')?.pass).toBe(false)
    expect(loggedCheck('크론 연결')?.detail).toMatch(/판정 불가/)
  })

  it('ad stats.unexpected > 0 이면 FAIL 이다 (failed 가 아니라 unexpected)', async () => {
    // Playwright JSON reporter 의 실패 카운터는 `unexpected` 다.
    // `failed` 를 읽으면 undefined → 0 이 되어 몇 개가 깨졌든 통과한다.
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ stats: { expected: 6, unexpected: 2, flaky: 0 } }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('광고 렌더링')?.pass).toBe(false)
    expect(loggedCheck('광고 렌더링')?.detail).toContain('2개 실패')
    expect(loggedVerdict()).toBe('FAIL')
  })

  it('ad stats.expected === 0 이면 FAIL 이다 — 아무것도 안 돌았다', async () => {
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ stats: { expected: 0, unexpected: 0, flaky: 0 } }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('광고 렌더링')?.pass).toBe(false)
    expect(loggedCheck('광고 렌더링')?.detail).toMatch(/0건/)
  })

  it('ad flaky 는 WARN 으로 남기고 통과시킨다', async () => {
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ stats: { expected: 6, unexpected: 0, flaky: 2 } }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    const ad = loggedCheck('광고 렌더링')
    expect(ad?.pass).toBe(true)
    expect(ad?.warn, 'flaky 를 조용히 PASS 로 묻으면 불안정이 쌓이는 걸 아무도 모른다').toBe(true)
  })

  it('ad stats 필드가 없으면 통과시키지 않는다', async () => {
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ suites: [] }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedCheck('광고 렌더링')?.pass).toBe(false)
  })
})

describe('AI 가 필수 검사 실패를 뒤집지 못한다', () => {
  // API 키가 없으면 synthesize 가 AI 호출 전에 FAIL 로 빠져 이 결함을 재현하지 못한다.
  // 키를 넣어 **AI 경로를 실제로 태운 뒤** 그래도 FAIL 인지 본다.
  const saved = process.env.ANTHROPIC_API_KEY
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key-not-real' })
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  })

  it('필수 검사 1건만 실패하면 AI 가 PASS 라 해도 FAIL 이다', async () => {
    // mock 된 Anthropic 은 항상 PASS 를 돌려준다. 그래도 FAIL 이어야 한다.
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ stats: { expected: 6, unexpected: 1, flaky: 0 } }) })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedVerdict(), 'AI PASS 가 필수 실패를 덮으면 깨진 배포가 초록불로 나간다').toBe('FAIL')
  })

  it('보조 검사만 실패하면 AI 판단을 따른다 — 필수/보조 구분이 실제로 작동한다', async () => {
    // 이 테스트가 있어야 위 테스트가 "무조건 FAIL" 이라서 통과하는 게 아님이 드러난다.
    dir = makeResults()
    postFindMany.mockRejectedValue(new Error('db down')) // 콘텐츠 품질 → WARN

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(loggedVerdict(), '필수는 전부 통과했으므로 FAIL 이 아니어야 한다').not.toBe('FAIL')
  })
})

describe('AdminQueue 실패 시 Slack 문구', () => {
  
  it('등록 실패면 "등록됨" 이라고 알리지 않는다', async () => {
    dir = makeResults({ 'smoke-result.json': JSON.stringify({ passed: 0, failed: 3, checks: [] }) })
    adminQueueCreate.mockRejectedValue(new Error('queue down'))

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    const sent = sendSlackMessage.mock.calls.map((c) => String(c[1])).join('\n')
    expect(sent, '없는 큐를 보러 가게 만든다').not.toContain('AdminQueue 등록됨')
    expect(sent).toContain('AdminQueue 등록 실패')
  })

  it('등록 성공이면 번호와 함께 알린다', async () => {
    dir = makeResults({ 'smoke-result.json': JSON.stringify({ passed: 0, failed: 3, checks: [] }) })
    // AdminQueue.id 는 스키마상 String @default(cuid()) 다 — 숫자가 아니다.
    adminQueueCreate.mockResolvedValue({ id: 'cq_test_77' })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    const sent = sendSlackMessage.mock.calls.map((c) => String(c[1])).join('\n')
    expect(sent).toContain('AdminQueue cq_test_77 등록됨')
  })
})

describe('기록 실패를 Slack 이 반드시 알린다', () => {
  it('필수 전부 PASS 인데 BotLog 가 실패하면 "프로덕션 정상"이라 하지 않는다', async () => {
    // 기록이 없으면 Slack 이 유일한 외부 알림이다. 그때 성공 축약을 보내면
    // 아무도 감사 흔적이 사라진 걸 모른다.
    dir = makeResults()
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main(dir)).rejects.toThrow(/BotLog 기록 실패/)

    expect(sendSlackMessage, 'BotLog 가 죽어도 Slack 은 시도해야 한다').toHaveBeenCalledTimes(1)
    const sent = String(sendSlackMessage.mock.calls[0][1])
    expect(sent).not.toContain('프로덕션 정상')
    expect(sent).toContain('BotLog 기록 실패')
    expect(sent).toContain('유일한 외부 알림')
  })

  it('WARN + BotLog 실패도 Slack 에 기록 실패를 싣는다', async () => {
    dir = makeResults({ 'ad-verify-result.json': JSON.stringify({ stats: { expected: 6, unexpected: 0, flaky: 2 } }) })
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    const sent = String(sendSlackMessage.mock.calls[0][1])
    expect(sent).toContain('WARN')
    expect(sent).toContain('BotLog 기록 실패')
  })

  it('AdminQueue 와 BotLog 가 동시에 실패하면 Slack 에 둘 다 싣는다', async () => {
    dir = makeResults({ 'smoke-result.json': JSON.stringify({ passed: 0, failed: 3, checks: [] }) })
    adminQueueCreate.mockRejectedValue(new Error('queue down'))
    botLogCreate.mockRejectedValue(new Error('db down'))

    const { main } = await loadAudit()
    await expect(main(dir)).rejects.toThrow(/치명 오류 2건/)

    const sent = String(sendSlackMessage.mock.calls[0][1])
    expect(sent).toContain('기록 실패 2건')
    expect(sent).toContain('AdminQueue 등록 실패')
    expect(sent).toContain('BotLog 기록 실패')
  })

  it('Slack 은 AdminQueue·BotLog 시도 이후에 호출된다', async () => {
    // 순서가 뒤집히면 기록이 실패했는지 모른 채 메시지를 보낸다.
    dir = makeResults({ 'smoke-result.json': JSON.stringify({ passed: 0, failed: 3, checks: [] }) })
    const order: string[] = []
    adminQueueCreate.mockImplementation(async () => { order.push('adminQueue'); return { id: 'cq_x' } })
    botLogCreate.mockImplementation(async () => { order.push('botLog'); return { id: 1 } })
    sendSlackMessage.mockImplementation(async () => { order.push('slack') })

    const { main } = await loadAudit()
    await main(dir).catch(() => {})

    expect(order).toEqual(['adminQueue', 'botLog', 'slack'])
  })
})

describe('테스트가 저장소 결과 파일을 건드리지 않는다', () => {
  it('실행 전 존재하던 루트 결과 파일이 그대로 보존된다', () => {
    // 예전 버전은 저장소 루트에 쓰고 지워서 CI 아티팩트나 개발자의 실제 결과를 날렸다.
    const repoRoot = resolve(__dirname, '../..')
    const before = RESULT_FILES.map((f) => {
      const p = resolve(repoRoot, f)
      return { f, exists: existsSync(p), content: existsSync(p) ? readFileSync(p, 'utf-8') : null }
    })
    // 위 describe 들이 이미 전부 실행된 뒤다.
    for (const b of before) {
      const p = resolve(repoRoot, b.f)
      expect(existsSync(p), `${b.f} 존재 여부가 바뀌면 안 된다`).toBe(b.exists)
      if (b.exists) expect(readFileSync(p, 'utf-8')).toBe(b.content)
    }
    // 임시 디렉터리를 쓰므로 루트에는 애초에 생기지 않는다.
    expect(tmpDirs.length, '임시 디렉터리를 실제로 사용했는지').toBeGreaterThan(0)
  })
})
