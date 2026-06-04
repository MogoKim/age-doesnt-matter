// CI read-only probe — gh 읽기 명령만 사용 (run list/view). merge/api 등 쓰기·임의호출 금지.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProbeResult } from './probe.types.js'
import { nowIso } from './probe.types.js'

const pexec = promisify(execFile)
const TIMEOUT_MS = 15000

// gh는 GH_TOKEN/GITHUB_TOKEN 환경변수를 키체인 인증보다 우선한다.
// .env.local에 (Actions용 등) GITHUB_TOKEN이 있으면 dotenv가 주입해 gh가 그 토큰으로 실패할 수 있다.
// → gh 호출 시 이 변수를 제거해 키체인 인증(gh auth login)을 쓰게 한다.
function ghEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  return env
}

interface GhRun {
  status: string // 'completed' | 'in_progress' | 'queued'
  conclusion: string | null // 'success' | 'failure' | 'cancelled' | null
  createdAt: string
}

/**
 * 워크플로우 최근 N개 run의 건강도.
 * - 실패 0 & success>0: ok=true (latest 진행중이면 signal=ci-running, 아니면 ci-healthy)
 * - 실패 존재: ok=false (signal=ci-failures)
 * - run 없음 / gh 조회 실패 / 타임아웃: ok=null (판정불가)
 *
 * gh CLI는 토큰을 stdout에 노출하지 않으며, detail에는 집계 수치만 담는다.
 */
export async function ciWorkflowHealth(workflowName: string, limit = 10): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const { stdout } = await pexec(
      'gh',
      ['run', 'list', '--workflow', workflowName, '--limit', String(limit), '--json', 'status,conclusion,createdAt'],
      { timeout: TIMEOUT_MS, env: ghEnv() },
    )
    const runs = JSON.parse(stdout) as GhRun[]
    if (!Array.isArray(runs) || runs.length === 0) {
      return base('ci', null, 'no-runs', { workflow: workflowName, sampleSize: 0 }, start)
    }
    const completed = runs.filter((r) => r.status === 'completed')
    const successCount = completed.filter((r) => r.conclusion === 'success').length
    const failCount = completed.filter((r) => r.conclusion === 'failure' || r.conclusion === 'cancelled').length
    const latest = runs[0]
    const latestRunning = latest.status !== 'completed'

    const detail = {
      workflow: workflowName.slice(0, 60),
      sampleSize: runs.length,
      successCount,
      failCount,
      latestStatus: latest.status,
      latestConclusion: latest.conclusion,
    }

    if (failCount > 0) return base('ci', false, 'ci-failures', detail, start)
    if (successCount === 0 && latestRunning) return base('ci', null, 'ci-running-only', detail, start)
    return base('ci', true, latestRunning ? 'ci-running' : 'ci-healthy', detail, start)
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { killed?: boolean }
    const timedOut = e.killed === true
    return {
      kind: 'ci',
      ok: null,
      signal: timedOut ? 'timeout' : 'gh-error',
      detail: { workflow: workflowName.slice(0, 60) },
      checkedAt: nowIso(),
      durationMs: Date.now() - start,
      error: timedOut ? 'gh timeout' : 'gh probe failed',
    }
  }
}

function base(
  kind: 'ci',
  ok: boolean | null,
  signal: string,
  detail: Record<string, string | number | boolean | null>,
  start: number,
): ProbeResult {
  return { kind, ok, signal, detail, checkedAt: nowIso(), durationMs: Date.now() - start }
}
