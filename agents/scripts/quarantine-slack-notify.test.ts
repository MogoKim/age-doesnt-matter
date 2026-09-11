/**
 * 격리 Slack 알림 — 실패가 **실패로 보이는지** 확인하는 테스트.
 *
 * 이전 구현의 진짜 문제는 "알림이 안 간 것"이 아니라
 * **안 갔는데도 workflow 가 success 였던 것**이다. 그래서 여기서는
 * 정상 경로보다 실패 경로를 더 많이 본다.
 */
import { describe, expect, it } from 'vitest'
import {
  parseDeadline, isOverdue, scanOverdue, resolveSlackConfig, buildMessage,
  postToSlack, run, isDirectRun, SLACK_POST_MESSAGE_URL,
  type ScanDeps, type FetchLike, type OverdueItem,
} from './quarantine-slack-notify.js'

// ── 테스트 더블 ──────────────────────────────────────────────
function scanFrom(manifests: Record<string, string>): ScanDeps {
  return {
    listFolders: () => Object.keys(manifests).sort(),
    readManifest: (_root, folder) => manifests[folder] ?? null,
  }
}

interface FetchCall { url: string; body: string; headers: Record<string, string> }

function fetchStub(res: { ok: boolean; status: number; body: string } | Error) {
  const calls: FetchCall[] = []
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers })
    if (res instanceof Error) throw res
    return { ok: res.ok, status: res.status, text: async () => res.body }
  }
  return { impl, calls }
}

const OK = { ok: true, status: 200, body: '{"ok":true,"ts":"1"}' }

function deps(over: Partial<Parameters<typeof run>[0]> = {}) {
  const lines: string[] = []
  const f = fetchStub(OK)
  return {
    lines,
    calls: f.calls,
    args: {
      today: '2026-09-11',
      env: { SLACK_BOT_TOKEN: 'dummy-token-for-test', SLACK_CHANNEL_LOG: 'C123' },
      fetchImpl: f.impl,
      scan: scanFrom({}),
      root: '_quarantine',
      dryRun: false,
      log: (l: string) => lines.push(l),
      ...over,
    } as Parameters<typeof run>[0],
  }
}

const manifest = (d: string) => `# 격리\n\n- 삭제 예정일: ${d}\n- 사유: 테스트\n`

// ─────────────────────────────────────────────────────────────
describe('기한 파싱·판정', () => {
  it('삭제 예정일에서 날짜를 뽑는다', () => {
    expect(parseDeadline(manifest('2026-09-01'))).toBe('2026-09-01')
  })

  it('날짜가 없으면 null', () => {
    expect(parseDeadline('# 격리\n- 사유: 없음\n')).toBeNull()
    expect(parseDeadline('')).toBeNull()
  })

  it('삭제 예정일이 아닌 줄의 날짜는 쓰지 않는다', () => {
    expect(parseDeadline('- 생성일: 2026-01-01\n- 삭제 예정일: 2026-09-01\n')).toBe('2026-09-01')
  })

  it('기한 당일도 초과로 본다 (이전 셸 구현과 동일 기준)', () => {
    expect(isOverdue('2026-09-11', '2026-09-11')).toBe(true)
    expect(isOverdue('2026-09-12', '2026-09-11')).toBe(true)
    expect(isOverdue('2026-09-10', '2026-09-11')).toBe(false)
  })
})

describe('스캔', () => {
  it('초과분만 고른다', () => {
    const found = scanOverdue('2026-09-11', '_quarantine', scanFrom({
      past: manifest('2026-09-01'),
      today: manifest('2026-09-11'),
      future: manifest('2026-12-31'),
    }))
    expect(found.map((f) => f.folder)).toEqual(['past', 'today'])
  })

  it('manifest 가 없는 폴더는 건너뛴다', () => {
    const d: ScanDeps = { listFolders: () => ['a', 'b'], readManifest: (_r, f) => (f === 'a' ? manifest('2026-01-01') : null) }
    expect(scanOverdue('2026-09-11', '_quarantine', d)).toHaveLength(1)
  })

  it('_quarantine 이 비어 있으면 0건', () => {
    expect(scanOverdue('2026-09-11', '_quarantine', scanFrom({}))).toEqual([])
  })
})

// ── 검증 1 ──────────────────────────────────────────────────
describe('검증 1 — 초과 0건이면 Slack 호출 0, 성공', () => {
  it('fetch 를 한 번도 부르지 않는다', async () => {
    const d = deps()
    expect(await run(d.args)).toBe(0)
    expect(d.calls).toHaveLength(0)
  })

  it('secret 이 하나도 없어도 성공한다 — 보낼 것이 없으니까', async () => {
    const d = deps({ env: {} })
    expect(await run(d.args)).toBe(0)
    expect(d.calls).toHaveLength(0)
  })
})

// ── 검증 2 ──────────────────────────────────────────────────
describe('검증 2 — 초과 있음 + Slack 성공 → 성공', () => {
  it('exit 0 이고 chat.postMessage 를 한 번 부른다', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }) })
    expect(await run(d.args)).toBe(0)
    expect(d.calls).toHaveLength(1)
    expect(d.calls[0].url).toBe(SLACK_POST_MESSAGE_URL)
    expect(d.calls[0].headers.Authorization).toMatch(/^Bearer /)
  })

  it('채널과 항목이 payload 에 담긴다', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }) })
    await run(d.args)
    const sent = JSON.parse(d.calls[0].body) as { channel: string; text: string }
    expect(sent.channel).toBe('C123')
    expect(sent.text).toContain('old')
    expect(sent.text).toContain('2026-08-01')
  })
})

// ── 검증 3 ──────────────────────────────────────────────────
describe('검증 3 — token/channel 없으면 실패', () => {
  it('둘 다 없으면 exit 1 이고 전송하지 않는다', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), env: {} })
    expect(await run(d.args)).toBe(1)
    expect(d.calls).toHaveLength(0)
  })

  it('token 만 없어도 실패', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), env: { SLACK_CHANNEL_LOG: 'C123' } })
    expect(await run(d.args)).toBe(1)
  })

  it('channel 만 없어도 실패', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), env: { SLACK_BOT_TOKEN: 'dummy-t' } })
    expect(await run(d.args)).toBe(1)
  })

  it('공백만 든 값도 없는 것으로 본다', async () => {
    const d = deps({
      scan: scanFrom({ old: manifest('2026-08-01') }),
      env: { SLACK_BOT_TOKEN: '   ', SLACK_CHANNEL_LOG: 'C123' },
    })
    expect(await run(d.args)).toBe(1)
  })

  it('누락 메시지에 secret 이름만 나오고 값은 없다', () => {
    expect(() => resolveSlackConfig({})).toThrow(/SLACK_BOT_TOKEN, SLACK_CHANNEL_LOG/)
  })
})

// ── 검증 4 ──────────────────────────────────────────────────
describe('검증 4 — HTTP 실패면 실패', () => {
  it('5xx 는 exit 1', async () => {
    const f = fetchStub({ ok: false, status: 503, body: 'upstream error' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
  })

  it('4xx 도 exit 1', async () => {
    const f = fetchStub({ ok: false, status: 401, body: '' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
  })

  it('네트워크 예외도 삼키지 않는다', async () => {
    const f = fetchStub(new Error('ENOTFOUND slack.com'))
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
    expect(d.lines.join('\n')).toContain('Slack 알림 실패')
  })
})

// ── 검증 5 ──────────────────────────────────────────────────
describe('검증 5 — HTTP 200 + ok:false 면 실패', () => {
  it('Slack 은 오류도 200 으로 준다 — 본문 ok 를 본다', async () => {
    const f = fetchStub({ ok: true, status: 200, body: '{"ok":false,"error":"channel_not_found"}' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
    expect(d.lines.join('\n')).toContain('channel_not_found')
  })

  it('invalid_auth 도 실패로 잡는다', async () => {
    const f = fetchStub({ ok: true, status: 200, body: '{"ok":false,"error":"invalid_auth"}' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
  })

  it('ok 필드가 아예 없으면 실패로 본다', async () => {
    const f = fetchStub({ ok: true, status: 200, body: '{}' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
  })

  it('JSON 이 아닌 응답도 실패로 본다', async () => {
    const f = fetchStub({ ok: true, status: 200, body: '<html>proxy</html>' })
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), fetchImpl: f.impl })
    expect(await run(d.args)).toBe(1)
  })

  it('postToSlack 은 성공 시 조용히 끝난다', async () => {
    const f = fetchStub(OK)
    await expect(postToSlack(f.impl, { token: 't', channel: 'C' }, { channel: 'C', text: 'x' }))
      .resolves.toBeUndefined()
  })
})

// ── 검증 6 ──────────────────────────────────────────────────
describe('검증 6 — 따옴표·개행이 JSON 을 깨지 않는다', () => {
  const nasty: OverdueItem[] = [
    { folder: 'he said "quote"', deadline: '2026-01-01' },
    { folder: 'line\nbreak', deadline: '2026-01-02' },
    { folder: 'back\\slash', deadline: '2026-01-03' },
    { folder: 'tab\there', deadline: '2026-01-04' },
    { folder: '한글 폴더 · 특수문자 ${injection} `cmd`', deadline: '2026-01-05' },
  ]

  it('JSON.parse 로 그대로 복원된다', () => {
    const msg = buildMessage('C123', nasty)
    const round = JSON.parse(JSON.stringify(msg)) as typeof msg
    expect(round.channel).toBe('C123')
    expect(round.text).toBe(msg.text)
  })

  it('전송 body 가 유효한 JSON 이고 내용이 보존된다', async () => {
    const d = deps({
      scan: scanFrom({
        'he said "quote"': manifest('2026-01-01'),
        'line\nbreak': manifest('2026-01-02'),
        'back\\slash': manifest('2026-01-03'),
      }),
    })
    expect(await run(d.args)).toBe(0)
    const sent = JSON.parse(d.calls[0].body) as { text: string }
    expect(sent.text).toContain('he said "quote"')
    expect(sent.text).toContain('line\nbreak')
    expect(sent.text).toContain('back\\slash')
  })

  it('명령 치환처럼 보이는 문자열도 그냥 텍스트다', async () => {
    const d = deps({ scan: scanFrom({ '$(rm -rf /) && echo': manifest('2026-01-01') }) })
    expect(await run(d.args)).toBe(0)
    const sent = JSON.parse(d.calls[0].body) as { text: string }
    expect(sent.text).toContain('$(rm -rf /) && echo')
  })

  it('항목 수가 본문에 정확히 들어간다', () => {
    expect(buildMessage('C', nasty).text).toContain(`${nasty.length}개 항목`)
  })
})

// ── 검증 7 ──────────────────────────────────────────────────
describe('검증 7 — 로그에 secret 값도 메시지 원문도 없다', () => {
  // secretlint 오탐을 피하려고 실제 토큰 접두사(xoxb-)를 쓰지 않는다 — 값 자체는 무의미하다
  const TOKEN = 'dummy-secret-value-for-leak-test'
  const CHANNEL = 'C-SECRET-CHANNEL'

  it('성공 경로', async () => {
    const d = deps({
      scan: scanFrom({ 'secret-folder-name': manifest('2026-08-01') }),
      env: { SLACK_BOT_TOKEN: TOKEN, SLACK_CHANNEL_LOG: CHANNEL },
    })
    await run(d.args)
    const log = d.lines.join('\n')
    expect(log).not.toContain(TOKEN)
    expect(log).not.toContain(CHANNEL)
    expect(log).not.toContain('격리 삭제 기한 초과')   // 메시지 원문
    expect(log).not.toContain('secret-folder-name')    // 메시지 내용
    expect(log).toContain('1건')                        // 건수는 남긴다
  })

  it('secret 누락 실패 경로', async () => {
    const d = deps({ scan: scanFrom({ old: manifest('2026-08-01') }), env: { SLACK_BOT_TOKEN: TOKEN } })
    await run(d.args)
    expect(d.lines.join('\n')).not.toContain(TOKEN)
  })

  it('Slack 오류 경로', async () => {
    const f = fetchStub({ ok: true, status: 200, body: '{"ok":false,"error":"invalid_auth"}' })
    const d = deps({
      scan: scanFrom({ 'secret-folder-name': manifest('2026-08-01') }),
      env: { SLACK_BOT_TOKEN: TOKEN, SLACK_CHANNEL_LOG: CHANNEL },
      fetchImpl: f.impl,
    })
    await run(d.args)
    const log = d.lines.join('\n')
    expect(log).not.toContain(TOKEN)
    expect(log).not.toContain('secret-folder-name')
  })

  it('dry-run 도 메시지 원문을 찍지 않는다', async () => {
    const d = deps({
      scan: scanFrom({ 'secret-folder-name': manifest('2026-08-01') }),
      env: { SLACK_BOT_TOKEN: TOKEN, SLACK_CHANNEL_LOG: CHANNEL },
      dryRun: true,
    })
    expect(await run(d.args)).toBe(0)
    expect(d.calls).toHaveLength(0)
    const log = d.lines.join('\n')
    expect(log).not.toContain('secret-folder-name')
    expect(log).toContain('[dry-run]')
  })
})

describe('import 부작용', () => {
  it('vitest 에서 import 해도 직접 실행으로 보지 않는다', () => {
    expect(isDirectRun()).toBe(false)
  })
})
