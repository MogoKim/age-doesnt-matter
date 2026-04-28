import { prisma, disconnect } from './core/db.js'

async function main() {
  const [installed, exposed, total] = await Promise.all([
    (prisma as any).user.count({ where: { pwaInstalled: true } }),
    (prisma as any).user.count({ where: { pwaPopupShownCount: { gt: 0 } } }),
    (prisma as any).user.count(),
  ])
  const exposedNotInstalled = await (prisma as any).user.count({
    where: { pwaPopupShownCount: { gt: 0 }, pwaInstalled: false },
  })

  console.log('=== PWA 현황 요약 ===')
  console.log('전체 유저:', total)
  console.log('팝업 노출 유저:', exposed, `(${(exposed / Math.max(total, 1) * 100).toFixed(1)}%)`)
  console.log('설치 완료 유저:', installed)
  console.log('노출 후 미설치:', exposedNotInstalled)
  if (exposed > 0) console.log('팝업→설치 전환율:', `${(installed / exposed * 100).toFixed(1)}%`)

  const dist = await (prisma as any).user.groupBy({
    by: ['pwaPopupShownCount'],
    where: { pwaPopupShownCount: { gt: 0 } },
    _count: { _all: true },
    orderBy: { pwaPopupShownCount: 'asc' },
  })
  console.log('\n=== 팝업 노출 횟수 분포 ===')
  if (!dist.length) console.log('  데이터 없음')
  for (const r of dist) console.log(`  ${r.pwaPopupShownCount}회 노출: ${r._count._all}명`)

  const recentInstalls = await (prisma as any).user.findMany({
    where: { pwaInstalled: true, pwaInstalledAt: { not: null } },
    select: { pwaInstalledAt: true },
    orderBy: { pwaInstalledAt: 'desc' },
    take: 50,
  })
  console.log('\n=== 설치 유저 기록 ===')
  if (!recentInstalls.length) {
    console.log('  설치 기록 없음')
  } else {
    const byDate: Record<string, number> = {}
    for (const u of recentInstalls) {
      if (!u.pwaInstalledAt) continue
      const d = new Date(u.pwaInstalledAt).toISOString().slice(0, 10)
      byDate[d] = (byDate[d] ?? 0) + 1
    }
    Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .forEach(([date, cnt]) => console.log(`  ${date}: ${cnt}건`))
  }

  const bannerDismissed = await (prisma as any).user.count({ where: { pwaBannerDismissCount: { gt: 0 } } })
  const bannerHidden = await (prisma as any).user.count({
    where: { pwaBannerHiddenUntil: { gt: new Date() } },
  })
  console.log('\n=== 배너 현황 ===')
  console.log('배너 거절 경험 유저:', bannerDismissed)
  console.log('현재 숨김 적용 중:', bannerHidden)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => disconnect())
