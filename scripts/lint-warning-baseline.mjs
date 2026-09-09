#!/usr/bin/env node
// lint 경고 baseline 가드 — Next 16 전환(2026-09-09).
//
// 왜 필요한가: eslint-config-next 16 이 React Compiler 계열 규칙을 새로 켜면서 기존 코드에
// 경고 84건이 생겼다. **전환 때문에 생긴 결함이 아니라 전에는 검사하지 않던 것**이라
// error 로 올리지 않고 warn 으로 뒀다. 그런데 warn 은 CI 를 막지 않아서, 그대로 두면
// 앞으로 새 경고가 조용히 섞여 들어와도 아무도 모른다.
//
// 그래서 **총량을 고정**한다. 줄이는 건 언제나 통과, 늘리는 건 실패.
// 규칙별 상한도 함께 본다 — 총량만 보면 한쪽을 고치고 다른 쪽을 늘리는 게 가려진다.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = JSON.parse(readFileSync(resolve(ROOT, 'scripts/lint-warning-baseline.json'), 'utf8'))

let raw
try {
  raw = execFileSync('npx', ['eslint', '.', '-f', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  // eslint 는 error 가 있으면 exit 1 이지만 stdout 에는 결과를 준다.
  raw = e.stdout
  if (!raw) {
    console.error('[lint-baseline] eslint 실행 실패'); process.exit(1)
  }
}

const results = JSON.parse(raw)
const byRule = {}
let errors = 0
for (const f of results) {
  for (const m of f.messages) {
    if (m.severity === 2) { errors++; continue }
    const id = m.ruleId ?? '(unknown)'
    byRule[id] = (byRule[id] ?? 0) + 1
  }
}
const total = Object.values(byRule).reduce((a, b) => a + b, 0)

const fail = []
if (errors > 0) fail.push(`error ${errors}건 — 경고 baseline 이전에 error 가 0 이어야 한다`)
if (total > BASELINE.total) fail.push(`총 경고 ${total} > baseline ${BASELINE.total}`)
for (const [rule, n] of Object.entries(byRule)) {
  const cap = BASELINE.rules[rule] ?? 0
  if (n > cap) fail.push(`${rule}: ${n} > baseline ${cap}`)
}

if (fail.length) {
  console.error('[lint-baseline] 경고가 늘었다:')
  for (const f of fail) console.error(`  - ${f}`)
  console.error('\n새 경고를 고치거나, 의도한 변화면 scripts/lint-warning-baseline.json 을 함께 낮춰라.')
  console.error('(baseline 을 올리는 것은 검사 약화다 — 리뷰에서 이유를 밝혀라.)')
  process.exit(1)
}

const shrunk = total < BASELINE.total
console.log(`[lint-baseline] error 0 · 경고 ${total}/${BASELINE.total}${shrunk ? ' — 줄었다. baseline 을 낮춰도 좋다' : ''}`)
