// 과거 회원 signupSource 1회 백필 — login EventLog의 referrer/browser_env로 가입채널 추정.
// 실행: DATABASE_URL="$DIRECT_URL" npx tsx --env-file=.env.local agents/scripts/backfill-signup-source.ts
// (운영 DB write — 트래픽 적을 때, direct 5432 사용으로 EMAXCONN 회피)
// 1) login(5/15+) referrer로 채널 역추적
// 2) login 기록 없어도 5/18(TWA Play 등록) 이전 가입자는 앱이 없었으므로 WEB 확정
// 3) 그 외(5/18+ 가입 & login 기록 없음)만 UNKNOWN 유지
import { prisma, disconnect } from '../core/db.js'

// TWA Google Play 등록일(2026-05-18 KST). 이 전엔 앱 설치가 불가능 → 모든 가입은 웹.
const TWA_LAUNCH = new Date('2026-05-18T00:00:00+09:00')
const isRealUser = (pid: string) => /^\d+$/.test(pid)

function channelFrom(ref: string, env: string): 'TWA' | 'WEB' {
  if (env === 'twa-android' || ref.startsWith('android-app://')) return 'TWA'
  return 'WEB'
}

async function run() {
  const dry = process.argv.includes('--dry')

  // 실고객(providerId 순수숫자)만 보정 — 봇 제외
  const users = (await prisma.user.findMany({
    where: { signupSource: null },
    select: { id: true, providerId: true, createdAt: true },
  })).filter((u) => isRealUser(u.providerId))
  const userIds = new Set(users.map((u) => u.id))
  console.log(`signupSource 미설정 실고객: ${users.length}`)

  // userId별 첫 login 이벤트의 채널
  const logins = await prisma.eventLog.findMany({
    where: { eventName: 'login', userId: { not: null } },
    select: { userId: true, referrer: true, properties: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const firstByUser = new Map<string, { ref: string; env: string }>()
  for (const l of logins) {
    if (!l.userId || !userIds.has(l.userId) || firstByUser.has(l.userId)) continue
    const p = l.properties as { browser_env?: unknown } | null
    const env = typeof p?.browser_env === 'string' ? p.browser_env : ''
    firstByUser.set(l.userId, { ref: l.referrer ?? '', env })
  }

  let twa = 0, web = 0, webByDate = 0, unknown = 0
  for (const u of users) {
    let source: 'TWA' | 'WEB' | null = null
    const lg = firstByUser.get(u.id)
    if (lg) {
      source = channelFrom(lg.ref, lg.env)
    } else if (u.createdAt < TWA_LAUNCH) {
      source = 'WEB' // 5/18 이전 = 앱 없었음 → 웹 확정
      webByDate++
    }
    if (!source) { unknown++; continue }
    if (!dry) {
      await prisma.user.updateMany({ where: { id: u.id, signupSource: null }, data: { signupSource: source } })
    }
    if (source === 'TWA') twa++; else web++
  }

  console.log(`${dry ? '[DRY] ' : ''}백필 결과: TWA ${twa} · WEB ${web}(그중 5/18이전 날짜확정 ${webByDate}) · UNKNOWN ${unknown}`)
  await disconnect()
}
run().catch((e) => { console.error(String(e)); process.exit(1) })
