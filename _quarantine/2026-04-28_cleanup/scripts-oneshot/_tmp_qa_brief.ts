import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of env.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  if (!process.env[k]) process.env[k] = v
}

async function main() {
  const { prisma } = await import('../agents/core/db.js')
  const { loadTodayBrief } = await import('../agents/core/intelligence.js')

  const todayStr = new Date().toISOString().slice(0, 10)
  let pass = 0, fail = 0

  function check(label: string, ok: boolean, detail = '') {
    const icon = ok ? '✅' : '❌'
    console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`)
    ok ? pass++ : fail++
  }

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`  Gate 1 QA — DailyBrief 생성 검증 (${todayStr})`)
  console.log(`${'═'.repeat(55)}\n`)

  // ── QA-1: DB 레코드 존재 여부 ──
  console.log('QA-1: DB 레코드 존재 여부')
  const brief = await prisma.dailyBrief.findUnique({
    where: { date: new Date(todayStr) },
  })
  check('DailyBrief 레코드 존재', !!brief)

  if (!brief) {
    console.log('\n❌ brief 없음 — 이하 QA 생략')
    await prisma.$disconnect()
    return
  }

  // ── QA-2: 필수 필드 완결성 ──
  console.log('\nQA-2: 필수 필드 완결성')
  const desireRanking = brief.desireRanking as Array<{category: string; percent: number; label: string}>
  const personaQuotas = brief.personaQuotas as Record<string, unknown>
  const contentDirective = brief.contentDirective as {primaryTheme: string; toneGuide: string; avoidTopics: string[]}

  check('mode 설정됨', !!brief.mode, `mode=${brief.mode}`)
  check('desireRanking 배열 존재', Array.isArray(desireRanking) && desireRanking.length > 0, `${desireRanking?.length ?? 0}개`)
  check('desireRanking 필드 완결 (category/percent/label)',
    desireRanking.every(d => d.category && typeof d.percent === 'number' && d.label),
    desireRanking.slice(0, 3).map(d => `${d.label}(${d.percent.toFixed(0)}%)`).join(', ')
  )
  check('personaQuotas 존재', !!personaQuotas && Object.keys(personaQuotas).length > 0, `${Object.keys(personaQuotas ?? {}).length}개 페르소나`)
  check('contentDirective 존재', !!(contentDirective?.primaryTheme && contentDirective?.toneGuide))
  check('entertainPct 숫자', typeof brief.entertainPct === 'number', `${brief.entertainPct}%`)
  check('entertainActive 불리언', typeof brief.entertainActive === 'boolean')

  // ── QA-3: mode 논리적 정합성 ──
  console.log('\nQA-3: mode 논리적 정합성')
  const todayTrend = await prisma.cafeTrend.findFirst({
    where: { period: 'daily', date: new Date(todayStr) },
  })
  const hasTodayTrend = !!todayTrend
  const modeDeep = brief.mode === 'deep'
  const modeFallback = brief.mode === 'fallback_yesterday'
  const modeOk = hasTodayTrend ? modeDeep : (modeDeep || modeFallback)

  check(`CafeTrend(today) ${hasTodayTrend ? '있음' : '없음'} → mode=${brief.mode}`, modeOk,
    hasTodayTrend ? '실제 데이터 기반' : 'fallback 또는 deep (어제 CafeTrend 사용)')

  // ── QA-4: intelligence.ts loadTodayBrief 실제 로드 검증 ──
  console.log('\nQA-4: intelligence.ts loadTodayBrief 로드 검증')
  const loaded = await loadTodayBrief()
  check('loadTodayBrief() 반환값 존재', !!loaded)
  if (loaded) {
    check('로드된 date가 오늘', loaded.date === todayStr, `loaded.date=${loaded.date}`)
    check('로드된 mode 일치', loaded.mode === brief.mode, `DB=${brief.mode} loaded=${loaded.mode}`)
    check('desireRanking 로드됨', loaded.desireRanking.length > 0, `${loaded.desireRanking.length}개`)
  }

  // ── QA-5: today-brief.json 파일 동기화 ──
  console.log('\nQA-5: today-brief.json 파일 동기화')
  const briefJsonPath = resolve(process.cwd(), 'agents/core/today-brief.json')
  const jsonExists = existsSync(briefJsonPath)
  check('today-brief.json 존재', jsonExists)
  if (jsonExists) {
    try {
      const jsonContent = JSON.parse(readFileSync(briefJsonPath, 'utf-8')) as {date: string; mode: string}
      check('json.date = 오늘', jsonContent.date === todayStr, `json.date=${jsonContent.date}`)
      check('json.mode 일치', jsonContent.mode === brief.mode)
    } catch {
      check('today-brief.json 파싱 성공', false, '파싱 오류')
    }
  }

  // ── QA-6: BotLog DAILY_BRIEF_GENERATE 기록 ──
  console.log('\nQA-6: BotLog 실행 기록')
  const generateLog = await prisma.botLog.findFirst({
    where: {
      botType: 'CAFE_CRAWLER',
      action: 'DAILY_BRIEF_GENERATE',
      executedAt: { gte: new Date(todayStr) },
    },
    orderBy: { executedAt: 'desc' },
  })
  check('DAILY_BRIEF_GENERATE BotLog 존재', !!generateLog)
  if (generateLog) {
    check('status=SUCCESS', generateLog.status === 'SUCCESS', `status=${generateLog.status}`)
    check('executionTimeMs 양수', (generateLog.executionTimeMs ?? 0) > 0, `${generateLog.executionTimeMs}ms`)
  }

  // ── 요약 ──
  console.log(`\n${'─'.repeat(55)}`)
  const total = pass + fail
  if (fail === 0) {
    console.log(`\n✅ Gate 1 QA 전체 통과 — ${pass}/${total}항목`)
    console.log('   오늘 DailyBrief 정상 생성 및 운영 준비 완료')
  } else {
    console.log(`\n❌ Gate 1 QA 부분 실패 — ${pass}통과 / ${fail}실패 / ${total}항목`)
  }
  console.log(`\n${'═'.repeat(55)}\n`)

  await prisma.$disconnect()
}

main().catch(e => { console.error('QA 오류:', e.message); process.exit(1) })
