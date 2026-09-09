// lock-sync.mjs — 코드와 의존성이 함께 움직이도록 보장한다.
//
// 사고 형태(2026-09-09 재현):
//   `com.unao.unao-prod-sync` 는 `git pull --ff-only` 만 했다. 그래서 main 에서
//   package-lock.json 이 바뀌어도 unao-prod 의 node_modules 는 옛 상태로 남았다.
//   실측: unao-prod 가 9793ee63(=lock 최신)인데 PR-F 에서 추가한 `yaml` 이 미설치였다.
//   **새 코드 + 옛 의존성** 조합은 조용히 돌다가 엉뚱한 곳에서 터진다.
//
// 방식: lock 파일의 해시를 `node_modules/.unao-lock-sha` 에 남긴다.
//   pull 뒤 해시가 다르거나 마커가 없으면 `npm ci` 를 돌리고, 실패하면 **명시적으로 실패**시킨다.
//   조용히 넘어가지 않는 것이 핵심이다 — 넘어가면 사고 형태가 그대로 돌아온다.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 이 저장소가 관리하는 lock 은 둘이다. 하나만 보면 agents 쪽이 어긋난 채로 남는다. */
export const LOCK_TARGETS = Object.freeze([
  Object.freeze({ name: 'root', dir: '.' }),
  Object.freeze({ name: 'agents', dir: 'agents' }),
])

export const MARKER = '.unao-lock-sha'

/**
 * 파일 접근을 주입할 수 있게 좁은 인터페이스로 고정한다.
 * node 의 fs 시그니처를 그대로 쓰면 호출부(테스트)가 PathLike·Buffer 오버로드까지 맞춰야 한다.
 * @typedef {{
 *   existsSync: (p: string) => boolean,
 *   readFileSync: (p: string, enc?: string) => string,
 *   writeFileSync?: (p: string, data: string) => void,
 * }} LockIo
 */

/** @param {string} text */
export function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * 어떤 대상을 다시 설치해야 하는지 판정한다. 부수효과 없음 — 테스트가 이 함수만 본다.
 * @param {string} tree
 * @param {LockIo} [io]
 * @returns {{name:string, dir:string, reason:'no-lock'|'no-marker'|'lock-changed'|'ok', lockSha:string|null}[]}
 */
export function planInstalls(tree, io = { existsSync, readFileSync }) {
  return LOCK_TARGETS.map(({ name, dir }) => {
    const base = dir === '.' ? tree : join(tree, dir)
    const lockPath = join(base, 'package-lock.json')
    if (!io.existsSync(lockPath)) return { name, dir, reason: 'no-lock', lockSha: null }

    const lockSha = sha(io.readFileSync(lockPath, 'utf8'))
    const markerPath = join(base, 'node_modules', MARKER)
    if (!io.existsSync(markerPath)) return { name, dir, reason: 'no-marker', lockSha }

    const seen = io.readFileSync(markerPath, 'utf8').trim()
    return { name, dir, reason: seen === lockSha ? 'ok' : 'lock-changed', lockSha }
  })
}

/**
 * 판정 결과대로 `npm ci` 를 돌린다.
 * @param {string} tree
 * @param {(dir: string, plan: {name:string, dir:string, reason:string, lockSha:string|null}) => number} run
 *        종료코드를 돌려준다(테스트에서 주입).
 * @param {LockIo} [io]
 * @returns {{installed:string[], skipped:string[], failed:{name:string, code:number}[]}}
 */
export function reconcile(tree, run, io = { existsSync, readFileSync, writeFileSync }) {
  const out = { installed: [], skipped: [], failed: [] }
  for (const plan of planInstalls(tree, io)) {
    if (plan.reason === 'no-lock' || plan.reason === 'ok') {
      out.skipped.push(plan.name)
      continue
    }
    const base = plan.dir === '.' ? tree : join(tree, plan.dir)
    const code = run(base, plan)
    if (code !== 0) {
      out.failed.push({ name: plan.name, code })
      continue
    }
    // 마커는 **성공한 뒤에만** 쓴다. 실패했는데 마커를 남기면 다음 실행이 "최신"으로 착각한다.
    io.writeFileSync?.(join(base, 'node_modules', MARKER), plan.lockSha ?? '')
    out.installed.push(plan.name)
  }
  return out
}
