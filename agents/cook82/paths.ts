/**
 * 82cook 후보 큐 — 파일 경로 단일 진실.
 *
 * 생성물은 전부 `agents/cook82/data/` 아래에만 쓴다.
 * 이 디렉터리는 .gitignore에 등재되어 있어 repo에 추적되지 않는다.
 * (M2-8 지시: generated queue/raw jsonl 파일 커밋 금지)
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 모든 생성물 루트 — gitignored */
export const DATA_DIR = join(HERE, 'data')

/** L1 수집 원본 */
export const rawPath = (stamp: string): string => join(DATA_DIR, `raw-${stamp}.jsonl`)

/** L2 판정 큐 — 큐의 정본 1개 파일 */
export const QUEUE_PATH = join(DATA_DIR, 'queue.jsonl')

/** L3 전달 감사 로그 — 언제 무엇이 Sheet로 갔는지 */
export const BRIDGE_LOG_PATH = join(DATA_DIR, 'bridge-log.jsonl')

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true })
}

/** 파일명용 타임스탬프 (KST) — YYYYMMDD-HHmm */
export function stampKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}-${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}
