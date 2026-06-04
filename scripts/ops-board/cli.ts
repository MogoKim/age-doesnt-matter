// /board 슬래시커맨드가 호출하는 CLI.
// 웹 칸반과 동일한 evaluateBoardState() 결과를 5분류 텍스트로 출력한다(단일 엔진 공유).
import './env.js'
import { evaluateBoardState, type EvaluatedCard } from './engine/evaluator.js'
import type { Column } from './probes/probe.types.js'

const CATEGORY_ORDER: Column[] = ['완료됨', '배포완료-적용확인', '지금가능', '백로그', '제외']

function evidence(card: EvaluatedCard): string {
  const parts: string[] = []
  if (card.probes.git) parts.push(`git:${card.probes.git.signal}`)
  if (card.probes.ci) parts.push(`ci:${card.probes.ci.signal}`)
  if (card.probes.http) {
    const oks = card.probes.http.filter((h) => h.ok === true).length
    parts.push(`http:${oks}/${card.probes.http.length} ok`)
  }
  if (card.probes.db) parts.push(`db:${card.probes.db.signal}`)
  return parts.length ? parts.join(' · ') : '정적(수동)'
}

async function main(): Promise<void> {
  const state = await evaluateBoardState()
  const time = state.generatedAt.slice(11, 19)

  console.log(`\n════════ 거울 보드 — 실측 기준 (${time} UTC) ════════`)
  console.log('※ Claude 보고가 아니라 git/CI/HTTP/DB probe 실측 결과입니다.')
  console.log('※ probe 카드 = 자동 판정 / 정적 카드 = 손 목록(상태는 작업 시작 시 probe로 자동 이동).\n')

  const byCategory = new Map<Column, EvaluatedCard[]>()
  for (const card of state.cards) {
    const list = byCategory.get(card.column) ?? []
    list.push(card)
    byCategory.set(card.column, list)
  }

  for (const cat of CATEGORY_ORDER) {
    const list = byCategory.get(cat)
    if (!list || list.length === 0) continue
    console.log(`【${cat}】 (${list.length})`)
    for (const card of list) {
      const flags = card.metaStale ? ' 🔍판정로직오래됨' : ''
      const ev = evidence(card)
      console.log(`  • ${card.title} [${card.track}]`)
      console.log(`     ${card.label || card.note || ''}${flags}  —  ${ev}`)
    }
    console.log('')
  }

  console.log('※ DB proof 필요 카드는 OPS_BOARD_READONLY_URL 연결 시 자동 완료 판정.')
  console.log('※ 시각적 실시간 칸반: npm run board → http://127.0.0.1:4321\n')
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[board] 실패:', (err as Error).message)
    process.exit(1)
  })
