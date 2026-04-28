import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
  // db.ts와 동일한 초기화 (top-level await 없이)
  const clientBase = new URL('../src/generated/prisma/client', import.meta.url).pathname

  let PrismaClientCtor: new (opts: Record<string, unknown>) => Record<string, unknown>
  try {
    const mod = await import(`${clientBase}.js`)
    PrismaClientCtor = mod.PrismaClient
  } catch {
    const mod = await import(`${clientBase}.ts`)
    PrismaClientCtor = mod.PrismaClient
  }

  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
  const u = new URL(url)
  const pool = new Pool({
    host: u.hostname,
    port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  const prisma = new PrismaClientCtor({ adapter: new PrismaPg(pool) }) as {
    user: {
      count(args?: Record<string, unknown>): Promise<number>
      groupBy(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
      findMany(args?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
    }
    $disconnect(): Promise<void>
  }

  const [installed, exposed, total] = await Promise.all([
    prisma.user.count({ where: { pwaInstalled: true } }),
    prisma.user.count({ where: { pwaPopupShownCount: { gt: 0 } } }),
    prisma.user.count(),
  ])
  const exposedNotInstalled = await prisma.user.count({
    where: { pwaPopupShownCount: { gt: 0 }, pwaInstalled: false },
  })

  console.log('=== PWA 현황 요약 ===')
  console.log('전체 유저:', total)
  console.log('팝업 노출 유저:', exposed, `(${(exposed / Math.max(total, 1) * 100).toFixed(1)}%)`)
  console.log('설치 완료 유저:', installed)
  console.log('노출 후 미설치:', exposedNotInstalled)
  if (exposed > 0) console.log('팝업→설치 전환율:', `${(installed / exposed * 100).toFixed(1)}%`)

  // 팝업 노출 횟수 분포
  const dist = await prisma.user.groupBy({
    by: ['pwaPopupShownCount'],
    where: { pwaPopupShownCount: { gt: 0 } },
    _count: { _all: true },
    orderBy: { pwaPopupShownCount: 'asc' },
  }) as Array<{ pwaPopupShownCount: number; _count: { _all: number } }>

  console.log('\n=== 팝업 노출 횟수 분포 ===')
  if (dist.length === 0) console.log('  데이터 없음')
  dist.forEach(r => console.log(`  ${r.pwaPopupShownCount}회 노출: ${r._count._all}명`))

  // 설치 타임라인
  const recentInstalls = await prisma.user.findMany({
    where: { pwaInstalled: true, pwaInstalledAt: { not: null } },
    select: { pwaInstalledAt: true },
    orderBy: { pwaInstalledAt: 'desc' },
    take: 50,
  }) as Array<{ pwaInstalledAt: Date | null }>

  console.log('\n=== 설치 유저 최근 기록 ===')
  if (recentInstalls.length === 0) {
    console.log('  설치 기록 없음')
  } else {
    const byDate: Record<string, number> = {}
    recentInstalls.forEach(u => {
      if (!u.pwaInstalledAt) return
      const d = u.pwaInstalledAt.toISOString().slice(0, 10)
      byDate[d] = (byDate[d] ?? 0) + 1
    })
    Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .forEach(([date, cnt]) => console.log(`  ${date}: ${cnt}건`))
  }

  // 배너 현황
  const bannerDismissed = await prisma.user.count({ where: { pwaBannerDismissCount: { gt: 0 } } })
  const bannerHidden = await prisma.user.count({
    where: { pwaBannerHiddenUntil: { gt: new Date() } },
  })
  console.log('\n=== 배너 현황 ===')
  console.log('배너 거절 경험 유저:', bannerDismissed)
  console.log('현재 숨김 적용 중:', bannerHidden)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
