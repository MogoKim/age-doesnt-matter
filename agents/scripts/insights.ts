// LOCAL ONLY — 실고객 인사이트 통합 측정 (봇 제외 정확판). 실행: npm run insights
//
// 목적: 흩어진 _*.ts(git 제외, 일회성) 5개를 따로 돌리지 않고, 한 명령으로 실고객 4대 지표를 본다.
//       이 파일이 "실고객 측정의 정확판 단일 진실"이다. (레거시 _retention-*.ts는 봇 필터가 부정확 — bot_ 만 제외)
//
// 봇 제외 기준 (절대 기준):
//   - 진짜 카카오 유저 = providerId가 순수 숫자(^\d+$). 봇은 curator-* / bot-* / seed* prefix.
//     Prisma는 정규식 where 미지원(Raw SQL 금지) → User를 조회한 뒤 JS에서 isRealUser()로 필터.
//   - sessionId 기반 지표(퍼널·채널·세션리텐션)는 EventLog.isBot=false 로 봇 제외
//     (isBot 판별은 src/app/api/events/route.ts 에 정확히 박혀 있음).
//
// 4대 초점: ① 재방문/리텐션 ② 가입전환 퍼널 ③ 콘텐츠 참여 ④ 유입 채널 효율
// 출력: 콘솔 + docs/analysis/insights-YYYY-MM-DD.md (덮어쓰기)
import { prisma, disconnect } from '../core/db.js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const isRealUser = (pid: string) => /^\d+$/.test(pid)
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
const kstDayIdx = (d: Date) => Math.floor((d.getTime() + 9 * 3600000) / 86400000)
const decode = (p: string) => { try { return decodeURIComponent(p) } catch { return p } }

const lines: string[] = []
const log = (s = '') => { console.log(s); lines.push(s) }

async function run() {
  const now = new Date()
  const start30 = new Date(now.getTime() - 30 * 86400000)
  const sevenAgo = new Date(now.getTime() - 7 * 86400000)

  log(`# 우나어 실고객 인사이트 — ${kstDay(now)} (봇 제외 자동측정)`)
  log('')
  log('> 실유저 기준: providerId 순수숫자(^\\d+$) | 세션지표: EventLog.isBot=false | 퍼널·채널: 최근 30일')
  log('> 생성: `npm run insights` (agents/scripts/insights.ts)')
  log('')

  // ─── 데이터 1회 조회 ───
  const allUsers = await prisma.user.findMany({
    select: {
      id: true, providerId: true, birthYear: true, gender: true,
      postCount: true, commentCount: true, isOnboarded: true, createdAt: true, status: true,
    },
  })
  const real = allUsers.filter(u => isRealUser(u.providerId))
  const realIds = new Set(real.map(u => u.id))

  const events = await prisma.eventLog.findMany({
    where: { isBot: false, createdAt: { gte: start30 }, NOT: { sessionId: null } },
    select: { sessionId: true, userId: true, eventName: true, path: true, referrer: true, createdAt: true, properties: true },
    orderBy: { createdAt: 'asc' },
  })

  // ════ SECTION 1 — 실고객 현황 ════
  log('## 1. 실고객 현황')
  log('')
  log(`- 실고객(진짜 카카오): **${real.length}명** / 전체 User ${allUsers.length}명 (봇 ${allUsers.length - real.length}개 제외)`)
  const onboarded = real.filter(u => u.isOnboarded).length
  const wrote = real.filter(u => u.postCount > 0).length
  const commented = real.filter(u => u.commentCount > 0).length
  const active = real.filter(u => u.postCount > 0 || u.commentCount > 0).length
  const new7 = real.filter(u => u.createdAt >= sevenAgo).length
  log(`- 온보딩 완료: ${onboarded}명 (${pct(onboarded, real.length)}%)`)
  log(`- 글 작성: ${wrote}명 (${pct(wrote, real.length)}%) · 댓글 작성: ${commented}명 (${pct(commented, real.length)}%) · 활동(글or댓글): ${active}명 (${pct(active, real.length)}%)`)
  log(`- 최근 7일 신규 실고객: ${new7}명`)
  log('')

  // ════ SECTION 2 — 재방문 / 리텐션 ════
  log('## 2. 재방문 / 리텐션')
  log('')
  // 2-1. 세션 리텐션 (sessionId 방문일수, 비회원 포함)
  const sVisitDays: Record<string, Set<number>> = {}
  for (const e of events) {
    if (e.eventName !== 'page_view') continue
    ;(sVisitDays[e.sessionId!] ??= new Set()).add(kstDayIdx(e.createdAt))
  }
  const sessIds = Object.keys(sVisitDays)
  const oneDay = sessIds.filter(s => sVisitDays[s].size === 1).length
  const multiDay = sessIds.filter(s => sVisitDays[s].size >= 2).length
  log(`- 세션 리텐션(30일, 비회원 포함): 전체 ${sessIds.length}세션 중 1일만 ${oneDay} (${pct(oneDay, sessIds.length)}%) · 2일+ 재방문 ${multiDay} (${pct(multiDay, sessIds.length)}%)`)
  // 2-2. login 재방문 (login 이벤트 userId/세션 2일+)
  const loginDays: Record<string, Set<number>> = {}
  for (const e of events) {
    if (e.eventName !== 'login') continue
    ;(loginDays[e.userId ?? e.sessionId!] ??= new Set()).add(kstDayIdx(e.createdAt))
  }
  const loginKeys = Object.keys(loginDays)
  const loginMulti = loginKeys.filter(k => loginDays[k].size >= 2).length
  log(`- 로그인 재방문(5/15+): login 기록 ${loginKeys.length}명 중 2일+ ${loginMulti}명 (${pct(loginMulti, loginKeys.length)}%)`)
  log(`- 활동 정착 신호: 실고객 활동자 ${active}명(${pct(active, real.length)}%) — 활동자일수록 재방문↑ (정밀 인과는 _real-users-all.ts)`)
  log('')

  // ════ SECTION 3 — 가입전환 퍼널 ════
  log('## 3. 가입전환 퍼널 (최근 30일, 세션 기준)')
  log('')
  const setOf = (name: string) => new Set(events.filter(e => e.eventName === name).map(e => e.sessionId!))
  const pv = setOf('page_view'), kakao = setOf('kakao_button_click'), lg = setOf('login'), ss = setOf('signup_step'), pcSet = setOf('post_create')
  log('```')
  log(`방문 ${pv.size}`)
  log(`  → 카카오버튼 ${kakao.size} (${pct(kakao.size, pv.size)}%)`)
  log(`  → 로그인 ${lg.size} (${pct(lg.size, pv.size)}%)`)
  log(`  → 가입절차 ${ss.size} (${pct(ss.size, pv.size)}%)`)
  log(`  → 글작성 ${pcSet.size} (${pct(pcSet.size, pv.size)}%)`)
  log('```')
  const stepSets: Record<string, Set<string>> = {}
  for (const e of events.filter(ev => ev.eventName === 'signup_step')) {
    const p = e.properties as { step?: unknown } | null
    ;(stepSets[String(p?.step ?? '?')] ??= new Set()).add(e.sessionId!)
  }
  const stepStr = Object.entries(stepSets).sort().map(([s, set]) => `step${s}:${set.size}`).join(' → ')
  if (stepStr) log(`- 온보딩 단계: ${stepStr}`)
  // 이탈 직전 페이지 top3
  const lastPath: Record<string, string> = {}
  for (const e of events.filter(ev => ev.eventName === 'page_view' && ev.path)) lastPath[e.sessionId!] = e.path!
  const exit: Record<string, number> = {}
  for (const p of Object.values(lastPath)) {
    const norm = decode(p).replace(/\/community\/[^/]+\/[^/]+/, '/community/[글]').replace(/\/community\/[^/]+/, '/community/[게시판]').replace(/\?.*$/, '')
    exit[norm] = (exit[norm] || 0) + 1
  }
  const exitTop = Object.entries(exit).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} ${pct(n, Object.keys(lastPath).length)}%`).join(' · ')
  log(`- 이탈 직전 페이지 top3: ${exitTop}`)
  log('')

  // ════ SECTION 4 — 유입 채널 효율 ════
  log('## 4. 유입 채널 효율 (세션 첫 referrer, 30일)')
  log('')
  const firstRef: Record<string, string> = {}
  for (const e of events.filter(ev => ev.eventName === 'page_view')) {
    if (!(e.sessionId! in firstRef)) firstRef[e.sessionId!] = typeof e.referrer === 'string' ? e.referrer : ''
  }
  const classify = (ref: string) => {
    if (ref.startsWith('android-app://')) return 'TWA 앱'
    if (ref.includes('google')) return 'Google'
    if (ref.includes('naver')) return 'Naver'
    if (ref.includes('youtube')) return 'YouTube'
    if (ref.includes('kakao')) return 'Kakao'
    if (ref.includes('t.co') || ref.includes('twitter') || ref.includes('x.com')) return 'Twitter/X'
    if (ref.includes('instagram')) return 'Instagram'
    if (ref.includes('facebook') || ref.includes('fb.')) return 'Facebook'
    if (ref === '') return '직접입력'
    return '기타'
  }
  const chan: Record<string, { total: number; signed: number; multi: number }> = {}
  for (const s of pv) {
    const c = classify(firstRef[s] ?? '')
    const v = (chan[c] ??= { total: 0, signed: 0, multi: 0 })
    v.total++
    if (lg.has(s)) v.signed++
    if ((sVisitDays[s]?.size ?? 0) >= 2) v.multi++
  }
  log('| 채널 | 세션 | 가입전환 | 재방문율 |')
  log('|---|---|---|---|')
  Object.entries(chan).sort((a, b) => b[1].total - a[1].total).forEach(([c, v]) =>
    log(`| ${c} | ${v.total} | ${v.signed}명 ${pct(v.signed, v.total)}% | ${pct(v.multi, v.total)}% |`))
  log('')

  // ════ SECTION 5 — 콘텐츠 참여 ════
  log('## 5. 콘텐츠 참여')
  log('')
  const boards = await prisma.post.groupBy({ by: ['boardType'], where: { source: 'USER' }, _count: true })
  log('- USER 작성 글: ' + boards.sort((a, b) => b._count - a._count).map(b => `${b.boardType} ${b._count}`).join(' · '))
  const views = await prisma.postView.findMany({ select: { readPercent: true }, take: 5000 })
  if (views.length) {
    let r0 = 0, rMid = 0, r100 = 0
    for (const v of views) { const rp = v.readPercent ?? 0; if (rp < 25) r0++; else if (rp < 100) rMid++; else r100++ }
    log(`- 읽기 깊이(${views.length}건): 0~24% 이탈 ${pct(r0, views.length)}% · 25~99% ${pct(rMid, views.length)}% · 완독 ${pct(r100, views.length)}%`)
  }
  // 실고객 댓글만 (author가 실유저)
  const comments = await prisma.comment.findMany({
    where: { status: 'ACTIVE', authorId: { not: null } },
    select: { authorId: true, post: { select: { boardType: true, source: true } } },
    take: 5000,
  })
  const userComments = comments.filter(c => c.authorId && realIds.has(c.authorId))
  const tgt: Record<string, number> = {}
  for (const c of userComments) { if (c.post) { const k = `${c.post.boardType}/${c.post.source}`; tgt[k] = (tgt[k] || 0) + 1 } }
  log(`- 실고객 댓글 ${userComments.length}개가 달린 글(게시판/출처): ` + Object.entries(tgt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' · '))
  log('')

  // ─── 저장 ───
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const outRel = `docs/analysis/insights-${kstDay(now)}.md`
  writeFileSync(path.resolve(dir, '../../', outRel), lines.join('\n'), 'utf-8')
  console.log(`\n✅ 저장: ${outRel}`)

  await disconnect()
}

run().catch(e => { console.error(String(e)); process.exit(1) })
