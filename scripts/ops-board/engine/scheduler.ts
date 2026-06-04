// 백그라운드 스케줄러 — probe를 1벌만 주기 실행하고 캐시.
// signal 변경 시에만 SSE 구독자에게 push (probe 횟수를 클라이언트 수와 분리 = 폭주 방지).
// 중복 실행 skip (이전 tick 미완료 시 건너뜀).
import { evaluateBoardState, type BoardState } from './evaluator.js'

type Subscriber = (s: BoardState) => void

let cache: BoardState | null = null
let running = false
const subscribers = new Set<Subscriber>()

export function getCache(): BoardState | null {
  return cache
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/** 컬럼/라벨이 바뀌었는지로 변경 감지 (checkedAt만 갱신된 경우는 push 안 함) */
function signature(s: BoardState): string {
  return s.cards.map((c) => `${c.id}:${c.column}:${c.label}:${c.metaStale}`).join('|')
}

async function tick(): Promise<void> {
  if (running) return // 중복 실행 skip
  running = true
  try {
    const next = await evaluateBoardState()
    const changed = !cache || signature(cache) !== signature(next)
    cache = next
    if (changed) {
      for (const fn of subscribers) fn(next)
    }
  } catch (err) {
    console.error('[ops-board] tick error:', (err as Error).message)
  } finally {
    running = false
  }
}

export function startScheduler(intervalMs = 60_000): void {
  void tick()
  setInterval(() => void tick(), intervalMs)
}
