// git read-only probe — 커밋 존재 여부만 확인 (write 명령 없음)
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProbeResult } from './probe.types.js'
import { nowIso } from './probe.types.js'

const pexec = promisify(execFile)
const TIMEOUT_MS = 5000

/**
 * 커밋 SHA 존재 확인.
 * - 존재: ok=true (signal: commit-exists)
 * - 명확히 없음(git exit 128): ok=false (signal: commit-missing)
 * - 타임아웃/기타 오류: ok=null (판정불가)
 */
export async function gitCommitExists(sha: string): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const { stdout } = await pexec(
      'git',
      ['log', '-1', '--format=%h %s', sha],
      { timeout: TIMEOUT_MS },
    )
    return {
      kind: 'git',
      ok: true,
      signal: 'commit-exists',
      detail: { sha, summary: stdout.trim().slice(0, 120) },
      checkedAt: nowIso(),
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const e = err as { code?: number | string; killed?: boolean; message?: string }
    // git이 커밋을 못 찾으면 exit code 128 → 명확한 '없음'(false)
    const isMissing = String(e.code) === '128' || /unknown revision|bad revision/i.test(String(e.message))
    const timedOut = e.killed === true
    return {
      kind: 'git',
      ok: timedOut ? null : isMissing ? false : null,
      signal: timedOut ? 'timeout' : isMissing ? 'commit-missing' : 'git-error',
      detail: { sha },
      checkedAt: nowIso(),
      durationMs: Date.now() - start,
      error: timedOut ? 'git timeout' : isMissing ? undefined : 'git probe failed',
    }
  }
}
