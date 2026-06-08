// DISPATCH ONLY — 로그/수집 테이블 보존정책 (P1-2). 크론은 dry 리포트만, 실제 삭제는 --apply 수동.
// ⚠️ 불가역 삭제(deleteMany). 기본은 dry(미삭제). 실제 삭제는 명시적 --apply 필요.
//
// 보존기간(의존성 조사 기반 — 분석 최장 의존 × 여유):
//   EventLog 180일 (운영 대시보드 최장 90일 의존. ⚠️ _retention-cohort/session 수동분석은 전 기간 스캔 → 장기 코호트 분석 시 재검토)
//   CafePost 90일 + Post 미참조분만 (발행글이 참조하는 원본은 보존 — 고아 방지)
//   BotLog   90일
//
// 실행: npx tsx --env-file=.env.local agents/scripts/purge-old-logs.ts          (dry, 미삭제)
//       npx tsx --env-file=.env.local agents/scripts/purge-old-logs.ts --apply  (실제 삭제)
import { prisma, disconnect } from '../core/db.js'

const DAY = 86400000
const EVENTLOG_DAYS = 180
const CAFEPOST_DAYS = 90
const BOTLOG_DAYS = 90
const BATCH = 10000 // 대량 deleteMany 배치 크기 (락·WAL 부하 완화)

// id 배치 삭제 헬퍼 — 오래된 행 id를 BATCH씩 끊어 삭제.
async function purgeByIds(
  label: string,
  findIds: (take: number) => Promise<string[]>,
  deleteByIds: (ids: string[]) => Promise<number>,
  dry: boolean,
): Promise<number> {
  if (dry) {
    const ids = await findIds(BATCH + 1)
    const n = ids.length > BATCH ? `${BATCH}+` : String(ids.length)
    console.log(`[DRY] ${label}: 삭제 대상 ${n}건`)
    return ids.length
  }
  let total = 0
  for (;;) {
    const ids = await findIds(BATCH)
    if (ids.length === 0) break
    total += await deleteByIds(ids)
    console.log(`[APPLY] ${label}: ${total}건 삭제…`)
    if (ids.length < BATCH) break
  }
  console.log(`[APPLY] ${label}: 총 ${total}건 삭제 완료`)
  return total
}

export async function purgeOldLogs(dry: boolean): Promise<void> {
  const now = Date.now()
  const eventCut = new Date(now - EVENTLOG_DAYS * DAY)
  const cafeCut = new Date(now - CAFEPOST_DAYS * DAY)
  const botCut = new Date(now - BOTLOG_DAYS * DAY)

  // EventLog — createdAt < 180일
  await purgeByIds(
    `EventLog(<${EVENTLOG_DAYS}d)`,
    async (take) => (await prisma.eventLog.findMany({
      where: { createdAt: { lt: eventCut } }, select: { id: true }, take,
    })).map((r) => r.id),
    async (ids) => (await prisma.eventLog.deleteMany({ where: { id: { in: ids } } })).count,
    dry,
  )

  // CafePost — crawledAt < 90일 AND Post가 참조하지 않는 것 (발행 원본 보존)
  const referencedRaw = await prisma.post.findMany({
    where: { cafePostId: { not: null } }, select: { cafePostId: true },
  })
  const referenced = new Set(referencedRaw.map((p) => p.cafePostId!).filter(Boolean))
  await purgeByIds(
    `CafePost(<${CAFEPOST_DAYS}d, Post미참조)`,
    async (take) => (await prisma.cafePost.findMany({
      where: { crawledAt: { lt: cafeCut }, id: { notIn: [...referenced] } }, select: { id: true }, take,
    })).map((r) => r.id),
    async (ids) => (await prisma.cafePost.deleteMany({ where: { id: { in: ids } } })).count,
    dry,
  )

  // BotLog — createdAt < 90일
  await purgeByIds(
    `BotLog(<${BOTLOG_DAYS}d)`,
    async (take) => (await prisma.botLog.findMany({
      where: { createdAt: { lt: botCut } }, select: { id: true }, take,
    })).map((r) => r.id),
    async (ids) => (await prisma.botLog.deleteMany({ where: { id: { in: ids } } })).count,
    dry,
  )
}

// 직접 실행 시 (크론은 runner 경유 — purgeOldLogs(true) dry만)
async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? '[APPLY 모드] 실제 삭제 진행' : '[DRY 모드] 미삭제 — 실제 삭제는 --apply')
  await purgeOldLogs(!apply)
  console.log(apply ? '\n→ 삭제 완료.' : '\n→ DRY: 변경 없음.')
  await disconnect()
}

const isDirect = process.argv[1]?.includes('purge-old-logs')
if (isDirect) main().catch((e) => { console.error(String(e)); process.exit(1) })
