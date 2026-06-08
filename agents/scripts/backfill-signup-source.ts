// 과거 회원 signupSource 1회 백필 — login EventLog의 referrer/browser_env로 가입채널 추정.
// 실행: DATABASE_URL="$DIRECT_URL" npx tsx --env-file=.env.local agents/scripts/backfill-signup-source.ts
// (운영 DB write — 트래픽 적을 때, direct 5432 사용으로 EMAXCONN 회피)
// login 이벤트 트래킹 5/15+ → 그 이전 가입자는 채울 수 없어 UNKNOWN(null) 유지.
import { prisma, disconnect } from '../core/db.js'

function channelFrom(ref: string, env: string): 'TWA' | 'WEB' {
  if (env === 'twa-android' || ref.startsWith('android-app://')) return 'TWA'
  return 'WEB'
}

async function run() {
  const dry = process.argv.includes('--dry')

  const users = await prisma.user.findMany({
    where: { signupSource: null },
    select: { id: true },
  })
  const userIds = new Set(users.map((u) => u.id))
  console.log(`signupSource 미설정 회원: ${users.length}`)

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
  console.log(`login 이벤트로 역추적 가능: ${firstByUser.size}명`)

  let twa = 0, web = 0
  for (const [uid, { ref, env }] of firstByUser) {
    const source = channelFrom(ref, env)
    if (!dry) {
      await prisma.user.updateMany({ where: { id: uid, signupSource: null }, data: { signupSource: source } })
    }
    if (source === 'TWA') twa++; else web++
  }

  console.log(`${dry ? '[DRY] ' : ''}백필 결과: TWA ${twa} · WEB ${web} · UNKNOWN(미채움) ${users.length - firstByUser.size}`)
  await disconnect()
}
run().catch((e) => { console.error(String(e)); process.exit(1) })
