import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `agents/cron/schedules.yaml` 의 handler 경로가 실재하는 파일인지 구조적으로 검사한다 — R4, 2026-09-09.
 *
 * 배경: B-3 로 카페·시트 공급망을 지웠는데 schedules.yaml 에는 `cafe/run-pipeline.ts` 처럼
 *       **사라진 파일을 가리키는 일정 5개**가 남아 있었다. 이 파일은 runner 가 직접 읽지 않아
 *       타입 검사에도, cron-links 검사에도 걸리지 않는다 — 조용히 거짓 계약이 된다.
 *
 * 그래서 여기서 세 가지를 고정한다.
 *   ① 모든 handler 가 실재 파일이다
 *   ② handler 는 agent/task 조합과 짝이 맞는다 (runner HANDLERS 에 실제로 있는 키다)
 *   ③ 파싱이 0건을 돌려주면 실패한다 (정규식이 깨져도 "전부 통과"가 되지 않게)
 */

const ROOT = join(__dirname, '../..')
const AGENTS = join(ROOT, 'agents')

interface Entry {
  agent: string
  task: string
  handler: string
  line: number
}

/** 최소 파서 — yaml 은 이 저장소의 직접 의존이 아니라 줄 단위로 읽는다. */
function parseSchedules(): Entry[] {
  const lines = readFileSync(join(AGENTS, 'cron/schedules.yaml'), 'utf-8').split('\n')
  const out: Entry[] = []
  let cur: Partial<Entry> = {}
  lines.forEach((raw, i) => {
    const l = raw.trim()
    if (l.startsWith('- cron:')) cur = { line: i + 1 }
    const m = /^(agent|task|handler):\s*"?([^"#]+?)"?\s*$/.exec(l)
    if (!m) return
    ;(cur as Record<string, string>)[m[1]] = m[2]
    if (cur.agent && cur.task && cur.handler) {
      out.push(cur as Entry)
      cur = { line: cur.line }
    }
  })
  return out
}

const entries = parseSchedules()

/** runner 의 HANDLERS 키 — 정규식으로 읽는다(파일을 import 하면 DB 커넥션이 뜬다). */
function runnerKeys(): Set<string> {
  const src = readFileSync(join(AGENTS, 'cron/runner.ts'), 'utf-8')
  const body = src.slice(src.indexOf('const HANDLERS'), src.indexOf('function getAutomationStatus'))
  return new Set([...body.matchAll(/^\s{2}'([a-z_]+:[a-z-]+)':/gm)].map((m) => m[1]))
}

describe('schedules.yaml — handler 경로가 실재한다', () => {
  it('일정을 하나라도 읽어야 한다 (파서가 죽으면 전부 통과가 된다)', () => {
    expect(entries.length, 'schedules.yaml 에서 일정을 하나도 읽지 못했다').toBeGreaterThan(0)
  })

  it('모든 handler 가 실재 파일이다', () => {
    const missing = entries
      .filter((e) => !existsSync(join(AGENTS, e.handler)))
      .map((e) => `${e.agent}:${e.task} → agents/${e.handler} (schedules.yaml:${e.line})`)
    expect(missing, '삭제된 파일을 가리키는 일정이 남아 있다').toEqual([])
  })

  it('모든 일정이 runner HANDLERS 에 있는 키다', () => {
    const keys = runnerKeys()
    expect(keys.size, 'runner HANDLERS 를 읽지 못했다').toBeGreaterThan(0)
    const orphans = entries
      .map((e) => `${e.agent.toLowerCase()}:${e.task}`)
      .filter((k) => !keys.has(k))
    expect([...new Set(orphans)], 'runner 에 없는 키를 예약하고 있다 — 실행되면 즉시 죽는다').toEqual([])
  })
})
