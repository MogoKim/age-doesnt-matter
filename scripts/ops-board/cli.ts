// /board 슬래시커맨드가 호출하는 CLI.
// 웹 칸반과 동일한 evaluateBoardState() 결과를 5분류 텍스트로 출력한다(단일 엔진 공유).
import './env.js'
import { evaluateBoardState, type EvaluatedCard } from './engine/evaluator.js'
import type { Column } from './probes/probe.types.js'

const COLUMN_TO_CATEGORY: Record<Column, string> = {
  DONE: '1. 완료됨',
  REVIEW: '2. 배포 완료, 적용 확인만 남음',
  DOING: '3. 지금 바로 할 수 있음 (확인·수정 필요)',
  PENDING: '3. 지금 바로 할 수 있음',
}

const CATEGORY_ORDER = [
  '1. 완료됨',
  '2. 배포 완료, 적용 확인만 남음',
  '3. 지금 바로 할 수 있음 (확인·수정 필요)',
  '3. 지금 바로 할 수 있음',
]

function evidence(card: EvaluatedCard): string {
  const parts: string[] = []
  if (card.probes.git) parts.push(`git:${card.probes.git.signal}`)
  if (card.probes.ci) parts.push(`ci:${card.probes.ci.signal}`)
  if (card.probes.http) {
    const oks = card.probes.http.filter((h) => h.ok === true).length
    parts.push(`http:${oks}/${card.probes.http.length} ok`)
  }
  if (card.probes.db) parts.push(`db:${card.probes.db.signal}`)
  return parts.join(' · ')
}

async function main(): Promise<void> {
  const state = await evaluateBoardState()
  const time = state.generatedAt.slice(11, 19)

  console.log(`\n════════ 거울 보드 — 실측 기준 (${time} UTC) ════════`)
  console.log('※ Claude 보고가 아니라 git/CI/HTTP probe 실측 결과입니다.\n')

  const byCategory = new Map<string, EvaluatedCard[]>()
  for (const card of state.cards) {
    const cat = COLUMN_TO_CATEGORY[card.column]
    const list = byCategory.get(cat) ?? []
    list.push(card)
    byCategory.set(cat, list)
  }

  for (const cat of CATEGORY_ORDER) {
    const list = byCategory.get(cat)
    if (!list || list.length === 0) continue
    console.log(`【${cat}】`)
    for (const card of list) {
      const flags = [card.metaStale ? '🔍판정로직오래됨' : ''].filter(Boolean).join(' ')
      console.log(`  • ${card.title} [${card.track}]`)
      console.log(`     상태: ${card.label} ${flags}`)
      console.log(`     근거: ${evidence(card)}  (검증 ${card.checkedAt.slice(11, 19)} UTC)`)
      if (card.note) console.log(`     비고: ${card.note}`)
    }
    console.log('')
  }

  console.log('※ DB probe는 OPS_BOARD_READONLY_URL이 있을 때만 실행됩니다. 없으면 REVIEW/PENDING으로 남깁니다.')
  console.log('※ 시각적 실시간 칸반: npm run board → http://127.0.0.1:4321\n')
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[board] 실패:', (err as Error).message)
    process.exit(1)
  })
