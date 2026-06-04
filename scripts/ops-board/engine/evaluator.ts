// 거울 보드 단일 진입점.
// /board(슬래시)와 웹 칸반이 둘 다 이 evaluateBoardState()의 결과만 사용한다.
// (슬래시 전용·웹 전용 조회 로직을 따로 만들지 않는다.)
import { CARDS, type Card, type Category } from '../cards/cards.js'
import { gitCommitExists } from '../probes/git-probe.js'
import { ciWorkflowHealth } from '../probes/ci-probe.js'
import { httpStatus } from '../probes/http-probe.js'
import { dbCount } from '../probes/db-probe.js'
import type { CardProbeResults, Column, ProbeResult } from '../probes/probe.types.js'
import { nowIso } from '../probes/probe.types.js'

export interface EvaluatedCard {
  id: string
  title: string
  track: string
  column: Column
  label: string
  baseCategory: Category
  probes: CardProbeResults
  checkedAt: string
  probeReviewedAt: string
  /** probe 가정이 90일 넘게 재검토 안 됨 → 틀린 GREEN 위험 경고 */
  metaStale: boolean
  note?: string
}

export interface BoardState {
  generatedAt: string
  cards: EvaluatedCard[]
}

function daysSince(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime()
  if (Number.isNaN(then)) return 0
  return (Date.now() - then) / 86_400_000
}

async function runCard(card: Card): Promise<EvaluatedCard> {
  const probes: CardProbeResults = {}
  // probe들은 카드 단위로 병렬 실행
  const tasks: Promise<void>[] = []
  if (card.probes.git) {
    const sha = card.probes.git
    tasks.push(gitCommitExists(sha).then((res) => void (probes.git = res)))
  }
  if (card.probes.ci) {
    const wf = card.probes.ci
    tasks.push(ciWorkflowHealth(wf).then((res) => void (probes.ci = res)))
  }
  if (card.probes.http) {
    const urls = card.probes.http
    tasks.push(
      Promise.all(urls.map((u) => httpStatus(u))).then((res: ProbeResult[]) => void (probes.http = res)),
    )
  }
  if (card.probes.db) {
    const { label, sql } = card.probes.db
    tasks.push(dbCount(label, sql).then((res) => void (probes.db = res)))
  }
  await Promise.all(tasks)

  const { column, label } = card.decide(probes)
  return {
    id: card.id,
    title: card.title,
    track: card.track,
    column,
    label,
    baseCategory: card.baseCategory,
    probes,
    checkedAt: nowIso(),
    probeReviewedAt: card.probeReviewedAt,
    metaStale: daysSince(card.probeReviewedAt) > 90,
    note: card.note,
  }
}

/** 단일 진입점: 모든 카드의 probe를 실행하고 판정한 보드 상태를 반환 */
export async function evaluateBoardState(): Promise<BoardState> {
  const cards = await Promise.all(CARDS.map(runCard))
  return { generatedAt: nowIso(), cards }
}
