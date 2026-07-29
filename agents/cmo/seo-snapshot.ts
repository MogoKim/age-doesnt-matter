/**
 * 주간 Google Search Console 스냅샷 (PR-E) — **관측 전용, read-only**
 *
 * 왜 만들었나: 2026-07-28에 Google SEO 구조조정(B1~B3 googlebot noindex + 갱년기 허브)을
 * 한꺼번에 적용했다. 효과 판정은 4~8주 뒤에나 가능한데, 사람이 매주 GSC를 열어보는 방식은
 * 반드시 끊긴다. 그래서 매주 월요일 자동으로 지표를 떠서 BotLog에 남기고 Slack으로 요약한다.
 *
 * 이 파일은 **아무것도 바꾸지 않는다**:
 *   - GSC는 webmasters.readonly 스코프만 쓴다(색인 요청·삭제 요청·sitemap 제출 없음).
 *   - sitemap.xml / robots.txt / googlebot noindex 정책을 건드리지 않는다.
 *   - 네이버는 측정 대상이 아니다(서치어드바이저에서 창업자가 별도 확인).
 *
 * 핵심 KPI는 **identity 쿼리의 클릭·노출**이다. brand 쿼리는 창업자·지인 클릭이 섞여
 * 실제 검색 성과를 왜곡하므로 판단 KPI로 쓰지 않고 참고 지표로만 남긴다.
 */
import { google } from 'googleapis'
import { prisma } from '../core/db.js'
import { safeBotLog } from '../core/safe-log.js'
import { sendSlackMessage } from '../core/notifier.js'

const SITE_URL = process.env.SEARCH_CONSOLE_SITE_URL ?? 'sc-domain:age-doesnt-matter.com'

/**
 * GSC 속성 정본은 도메인 속성(sc-domain)이다. www URL 접두어 속성에는 데이터가 거의 없다.
 * 2026-07-28에 secret이 www 속성을 가리키는 바람에 클릭 0·노출 14로 수집돼 스냅샷 2건이
 * 오염됐다. 실패시키면 관측이 통째로 멈추므로, 경고를 남기고 PARTIAL로 기록해 눈에 띄게 한다.
 */
const isWwwProperty = SITE_URL.includes('www.age-doesnt-matter.com')
/** GSC 데이터는 2~3일 지연된다 — 기준 종료일을 3일 전으로 잡아야 빈 구간을 세지 않는다 */
const LAG_DAYS = 3
const DAY_MS = 86_400_000

const BRAND_KEYWORDS = ['우나어', '우리나이', '우리 나이', "age doesn't matter", 'age-doesnt-matter']

const IDENTITY_KEYWORDS = [
  '갱년기', '폐경', '완경', '호르몬', '안면홍조', '불면', '식은땀', '골다공',
  '40대', '50대', '60대', '중년',
  '재취업', '일자리', '알바', '은퇴', '연금', '노후', '건강보험',
  '부부', '남편', '시댁', '자녀', '외로움', '빈둥지', '우리 또래', '커뮤니티',
]

/** 연예·방송 잡담 — KPI가 아니라 "아직 남아 있는 노이즈" 참고용 */
const NOISE_KEYWORDS = [
  '드라마', '배우', '연예', '아이돌', '가수', '예능', '방송', '출연',
  '넷플', '유튜버', '열애', '근황', '인간극장', '나혼산',
]

type Segment = 'BRAND' | 'IDENTITY' | 'NOISE' | 'OTHER'
type Area = 'home' | 'community' | 'magazine' | 'jobs' | 'guide' | 'topic' | 'other'

interface GscRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface Totals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

const EMPTY_TOTALS: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 }

function getAuth() {
  const base64Json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  if (!base64Json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 미설정')
  const creds = JSON.parse(Buffer.from(base64Json, 'base64').toString('utf-8')) as {
    client_email: string
    private_key: string
  }
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  })
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** ISO 주차 (2026-W31 형식) — 스냅샷 식별자 */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function classifyQuery(query: string): Segment {
  const q = query.toLowerCase()
  if (BRAND_KEYWORDS.some((k) => q.includes(k.toLowerCase()))) return 'BRAND'
  if (IDENTITY_KEYWORDS.some((k) => query.includes(k))) return 'IDENTITY'
  if (NOISE_KEYWORDS.some((k) => query.includes(k))) return 'NOISE'
  return 'OTHER'
}

function classifyArea(url: string): Area {
  const path = decodeURIComponent(url).replace(/^https?:\/\/[^/]+/, '')
  if (path === '' || path === '/') return 'home'
  if (path.startsWith('/topic/')) return 'topic'
  if (path.startsWith('/community/')) return 'community'
  if (path.startsWith('/magazine')) return 'magazine'
  if (path.startsWith('/jobs')) return 'jobs'
  if (path.startsWith('/guide')) return 'guide'
  return 'other'
}

function sumRows(rows: GscRow[]): Totals {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0,
    // position은 노출 가중 평균이어야 의미가 있다(단순 평균은 노출 1회짜리에 끌려간다)
    position: impressions > 0
      ? Number((rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions).toFixed(1))
      : 0,
  }
}

type SearchConsole = ReturnType<typeof google.searchconsole>

async function queryGsc(
  sc: SearchConsole,
  dimension: 'query' | 'page' | null,
  startDate: string,
  endDate: string,
  rowLimit = 25_000,
): Promise<GscRow[]> {
  const res = await sc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate,
      endDate,
      ...(dimension ? { dimensions: [dimension] } : {}),
      rowLimit,
    },
  })
  const rows = res.data.rows ?? []
  return rows.map((r) => ({
    key: r.keys?.[0] ?? '',
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

function pct(current: number, previous: number | undefined): string {
  if (previous === undefined || previous === null) return 'n/a'
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  if (previous === 0) return `${sign}${diff}`
  return `${sign}${diff} (${sign}${Math.round((diff / previous) * 100)}%)`
}

interface PreviousSnapshot {
  week?: string
  createdAt: Date
  /** 그 스냅샷이 실제로 조회한 GSC 속성. 구버전 스냅샷에는 없다(undefined) */
  siteUrl?: string
  identityClicks?: number
  identityImpressions?: number
  totalClicks?: number
  totalImpressions?: number
  topicMenopauseImpressions?: number
}

/**
 * agents/core/db.ts의 prisma는 런타임 동적 로딩이라 타입이 unknown이다.
 * 이 파일에서 쓰는 최소 형태만 선언해 `any` 없이 좁힌다.
 */
interface BotLogDelegate {
  findFirst(args: Record<string, unknown>): Promise<{ createdAt: Date; details: string | null } | null>
}
const botLog = (prisma as unknown as { botLog: BotLogDelegate }).botLog

/** 직전 스냅샷 1건을 읽어 비교 기준으로 쓴다. details는 String 컬럼이라 JSON.parse가 필수다. */
async function loadPreviousSnapshot(): Promise<{ snapshot: PreviousSnapshot | null; parseFailed: boolean }> {
  const last = await botLog.findFirst({
    where: { botType: 'CMO', action: 'SEO_SNAPSHOT', status: { in: ['SUCCESS', 'PARTIAL'] } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, details: true },
  })
  if (!last) return { snapshot: null, parseFailed: false }

  try {
    const parsed = JSON.parse(last.details ?? '{}') as {
      week?: string
      siteUrl?: string
      totals?: { d28?: Totals }
      segments?: { identity?: Totals }
      trackedPages?: Record<string, Totals>
    }
    return {
      snapshot: {
        week: parsed.week,
        createdAt: last.createdAt,
        siteUrl: parsed.siteUrl,
        identityClicks: parsed.segments?.identity?.clicks,
        identityImpressions: parsed.segments?.identity?.impressions,
        totalClicks: parsed.totals?.d28?.clicks,
        totalImpressions: parsed.totals?.d28?.impressions,
        topicMenopauseImpressions: parsed.trackedPages?.['/topic/menopause']?.impressions,
      },
      parseFailed: false,
    }
  } catch {
    // 이전 스냅샷이 깨져도 이번 수집은 계속한다 — 다만 PARTIAL로 남겨 원인을 남긴다
    return { snapshot: { createdAt: last.createdAt }, parseFailed: true }
  }
}

const TRACKED_PATHS = [
  '/topic/menopause',
  '/community/stories',
  '/community/life2',
  '/community/humor',
  '/community/menopause',
] as const

async function main(): Promise<void> {
  const startedAt = Date.now()

  let auth: ReturnType<typeof getAuth>
  try {
    auth = getAuth()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[SEO Snapshot] 인증 실패:', reason)
    await safeBotLog({
      botType: 'CMO',
      action: 'SEO_SNAPSHOT',
      status: 'FAILED',
      details: JSON.stringify({ error: reason }),
      executionTimeMs: Date.now() - startedAt,
    })
    await sendSlackMessage('SYSTEM', `🔴 *주간 SEO 스냅샷 실패*\n원인: ${reason}\n필요 조치: GitHub Secrets \`GOOGLE_SERVICE_ACCOUNT_JSON\` 확인`)
    // process.exit 대신 throw — runner가 finally에서 DB 연결을 정리한 뒤 exit 1로 끝낸다
    throw new Error(`SEO 스냅샷 인증 실패: ${reason}`)
  }

  const sc = google.searchconsole({ version: 'v1', auth })
  const rangeEndDate = new Date(Date.now() - LAG_DAYS * DAY_MS)
  const rangeEnd = ymd(rangeEndDate)
  const startOf = (days: number) => ymd(new Date(rangeEndDate.getTime() - (days - 1) * DAY_MS))

  let partialReason: string | null = null

  try {
    // ── 총계 3구간 (dimension 없이 요청하면 합계 1행이 온다)
    const [d7Rows, d28Rows, d90Rows] = await Promise.all([
      queryGsc(sc, null, startOf(7), rangeEnd, 1),
      queryGsc(sc, null, startOf(28), rangeEnd, 1),
      queryGsc(sc, null, startOf(90), rangeEnd, 1),
    ])
    const totals = {
      d7: d7Rows[0] ? { clicks: d7Rows[0].clicks, impressions: d7Rows[0].impressions, ctr: Number(d7Rows[0].ctr.toFixed(4)), position: Number(d7Rows[0].position.toFixed(1)) } : EMPTY_TOTALS,
      d28: d28Rows[0] ? { clicks: d28Rows[0].clicks, impressions: d28Rows[0].impressions, ctr: Number(d28Rows[0].ctr.toFixed(4)), position: Number(d28Rows[0].position.toFixed(1)) } : EMPTY_TOTALS,
      d90: d90Rows[0] ? { clicks: d90Rows[0].clicks, impressions: d90Rows[0].impressions, ctr: Number(d90Rows[0].ctr.toFixed(4)), position: Number(d90Rows[0].position.toFixed(1)) } : EMPTY_TOTALS,
    }

    // ── 쿼리·페이지 28일
    const [queryRows, pageRows] = await Promise.all([
      queryGsc(sc, 'query', startOf(28), rangeEnd),
      queryGsc(sc, 'page', startOf(28), rangeEnd),
    ])

    // 쿼리 분류
    const bySegment: Record<Segment, GscRow[]> = { BRAND: [], IDENTITY: [], NOISE: [], OTHER: [] }
    for (const row of queryRows) bySegment[classifyQuery(row.key)].push(row)

    const segments = {
      brand: sumRows(bySegment.BRAND),
      identity: sumRows(bySegment.IDENTITY),
      noise: sumRows(bySegment.NOISE),
      other: sumRows(bySegment.OTHER),
    }

    const topQueries = [...queryRows]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
      .map((r) => ({ query: r.key, clicks: r.clicks, impressions: r.impressions, position: Number(r.position.toFixed(1)) }))

    const identityQueries = bySegment.IDENTITY
      .sort((a, b) => b.impressions - a.impressions)
      .map((r) => ({ query: r.key, clicks: r.clicks, impressions: r.impressions, position: Number(r.position.toFixed(1)) }))

    // 기회 쿼리: 이미 5~20위에 걸려 있는데 클릭이 0 — 제목·메타만 손봐도 클릭이 붙을 자리
    const opportunities = queryRows
      .filter((r) => r.clicks === 0 && r.position >= 5 && r.position <= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15)
      .map((r) => ({ query: r.key, impressions: r.impressions, position: Number(r.position.toFixed(1)) }))

    // 페이지 분류
    const byArea: Record<Area, GscRow[]> = { home: [], community: [], magazine: [], jobs: [], guide: [], topic: [], other: [] }
    for (const row of pageRows) byArea[classifyArea(row.key)].push(row)

    const areas = Object.fromEntries(
      (Object.keys(byArea) as Area[]).map((area) => [
        area,
        { ...sumRows(byArea[area]), urls: byArea[area].length },
      ]),
    )

    const topPages = [...pageRows]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
      .map((r) => ({ page: decodeURIComponent(r.key), clicks: r.clicks, impressions: r.impressions, position: Number(r.position.toFixed(1)) }))

    // 추적 대상 경로 — prefix 합산(상세 글 URL까지 포함)
    const trackedPages = Object.fromEntries(
      TRACKED_PATHS.map((path) => {
        const matched = pageRows.filter((r) => decodeURIComponent(r.key).includes(path))
        return [path, { ...sumRows(matched), urls: matched.length }]
      }),
    ) as Record<string, Totals & { urls: number }>

    /**
     * index: "구글이 실제로 노출시킨 URL 규모".
     * GSC Search Analytics로는 색인 총수를 얻을 수 없어서, 28일간 노출을 1회라도 받은
     * 고유 URL 수를 색인 규모의 프록시로 쓴다. B1~B3 noindex 효과가 여기서 드러난다.
     */
    const index = {
      urlsWithImpressions28d: pageRows.filter((r) => r.impressions > 0).length,
      urlsWithClicks28d: pageRows.filter((r) => r.clicks > 0).length,
      byArea: Object.fromEntries((Object.keys(byArea) as Area[]).map((a) => [a, byArea[a].length])),
    }

    // ── 직전 스냅샷 비교
    const { snapshot: prev, parseFailed } = await loadPreviousSnapshot()
    if (parseFailed) partialReason = '직전 스냅샷 details JSON.parse 실패 — 이번 주 delta 비교 생략'

    const gapDays = prev ? Math.floor((Date.now() - prev.createdAt.getTime()) / DAY_MS) : null
    const gapWarning = gapDays !== null && gapDays >= 14

    /**
     * 조회 속성이 바뀌었으면 delta를 계산하지 않는다.
     * 다른 GSC 속성끼리 빼면 "노출 +4114%" 같은 가짜 신호가 나온다(2026-07-29에 실제로 겪었다).
     * 구버전 스냅샷은 siteUrl을 기록하지 않았으므로(undefined) 그것도 비교 대상에서 뺀다.
     */
    const siteUrlMismatch = prev !== null && prev.siteUrl !== SITE_URL
    const skipReason = prev === null
      ? null
      : prev.siteUrl === undefined
        ? 'siteUrl 미기록 스냅샷(구버전)과는 비교하지 않음'
        : siteUrlMismatch
          ? `GSC 속성 변경(${prev.siteUrl} → ${SITE_URL})으로 delta 생략`
          : null

    const topicMenopauseImpressions = trackedPages['/topic/menopause']?.impressions ?? 0
    const comparable = prev !== null && skipReason === null
    const deltaVsLastWeek = {
      previousWeek: prev?.week ?? null,
      previousSiteUrl: prev?.siteUrl ?? null,
      gapDays,
      skipped: skipReason,
      identityClicks: comparable ? pct(segments.identity.clicks, prev.identityClicks) : 'n/a',
      identityImpressions: comparable ? pct(segments.identity.impressions, prev.identityImpressions) : 'n/a',
      totalClicks: comparable ? pct(totals.d28.clicks, prev.totalClicks) : 'n/a',
      totalImpressions: comparable ? pct(totals.d28.impressions, prev.totalImpressions) : 'n/a',
      topicMenopauseImpressions: comparable
        ? pct(topicMenopauseImpressions, prev.topicMenopauseImpressions)
        : 'n/a',
    }

    // ── 이번 주 판정 (비교 불가하면 판정하지 않는다)
    let verdict: string
    const prevIdentityImp = comparable ? prev.identityImpressions : undefined
    if (segments.identity.impressions < 10 || prevIdentityImp === undefined) {
      verdict = '데이터 부족'
    } else if (segments.identity.impressions >= prevIdentityImp * 1.1) {
      verdict = '정체성 노출 개선'
    } else if (segments.identity.impressions <= prevIdentityImp * 0.9) {
      verdict = '정체성 노출 악화'
    } else {
      verdict = '관찰 정상'
    }

    if (isWwwProperty && !partialReason) {
      partialReason = `SEARCH_CONSOLE_SITE_URL이 www 속성(${SITE_URL})입니다 — 정본은 sc-domain:age-doesnt-matter.com. 수집값이 실제보다 훨씬 작습니다.`
    }

    const week = isoWeek(rangeEndDate)
    const details = {
      week,
      rangeEnd,
      /** 이번 스냅샷이 실제로 조회한 GSC 속성 — 다음 주 delta 비교의 전제 조건이다 */
      siteUrl: SITE_URL,
      totals,
      segments,
      areas,
      topQueries,
      topPages,
      opportunities,
      identityQueries,
      trackedPages,
      index,
      deltaVsLastWeek,
      verdict,
    }

    const status = partialReason ? 'PARTIAL' : 'SUCCESS'
    await safeBotLog({
      botType: 'CMO',
      action: 'SEO_SNAPSHOT',
      status,
      details: JSON.stringify(details),
      itemCount: queryRows.length + pageRows.length,
      executionTimeMs: Date.now() - startedAt,
    })

    // ── Slack 요약
    const line = (label: string, t: Totals & { urls?: number }) =>
      `  • ${label}: 노출 ${t.impressions} / 클릭 ${t.clicks}${t.urls !== undefined ? ` / URL ${t.urls}` : ''}`

    const text = [
      `📊 *주간 Google SEO 스냅샷 — ${week}* (기준 ${rangeEnd}까지)`,
      `_GSC 속성: ${SITE_URL}_`,
      '',
      `*1. 전체 28일*: 클릭 ${totals.d28.clicks} / 노출 ${totals.d28.impressions} / 평균순위 ${totals.d28.position}`,
      `   7일 클릭 ${totals.d7.clicks}·노출 ${totals.d7.impressions} | 90일 클릭 ${totals.d90.clicks}·노출 ${totals.d90.impressions}`,
      `   변화: 클릭 ${deltaVsLastWeek.totalClicks} / 노출 ${deltaVsLastWeek.totalImpressions}`,
      '',
      `*2. 정체성 쿼리(핵심 KPI)*: 클릭 ${segments.identity.clicks} / 노출 ${segments.identity.impressions}`,
      `   변화: 클릭 ${deltaVsLastWeek.identityClicks} / 노출 ${deltaVsLastWeek.identityImpressions}`,
      `   (참고 — 브랜드 ${segments.brand.impressions}노출 · 연예·잡담 ${segments.noise.impressions}노출)`,
      '',
      `*3. 갱년기 허브 /topic/menopause*: 노출 ${topicMenopauseImpressions} / 클릭 ${trackedPages['/topic/menopause']?.clicks ?? 0}`,
      `   변화: ${deltaVsLastWeek.topicMenopauseImpressions}`,
      '',
      '*4. 커뮤니티 보드별 (28일)*',
      line('사는이야기', trackedPages['/community/stories']),
      line('2막준비', trackedPages['/community/life2']),
      line('웃음방', trackedPages['/community/humor']),
      line('갱년기톡', trackedPages['/community/menopause']),
      '',
      `*5. 구글 노출 URL 규모*: ${index.urlsWithImpressions28d}개 (클릭 발생 ${index.urlsWithClicks28d}개)`,
      '',
      '*6. 기회 쿼리 TOP 3* (5~20위인데 클릭 0)',
      ...(opportunities.length > 0
        ? opportunities.slice(0, 3).map((o) => `  • ${o.query} — ${o.impressions}노출 / ${o.position}위`)
        : ['  • 해당 없음']),
      '',
      `*7. 이번 주 판정*: ${verdict}`,
      ...(skipReason ? [`  ⚠️ 전주 대비 변화 생략 — ${skipReason}`] : []),
      ...(gapWarning ? [`  ⚠️ 직전 스냅샷이 ${gapDays}일 전입니다 — 주간 수집이 끊겼는지 확인 필요`] : []),
      ...(partialReason ? [`  ⚠️ ${partialReason}`] : []),
      '',
      '*8. 다음 액션*: 이 Slack을 Codex에게 보내 판단을 요청하세요.',
      '',
      '_이 리포트는 관측 전용입니다. SEO 정책을 바꾸지 않으며 네이버는 측정 대상이 아닙니다._',
    ].join('\n')

    await sendSlackMessage('DASHBOARD', text)
    console.log(`[SEO Snapshot] ${status} — ${week}, 쿼리 ${queryRows.length} / 페이지 ${pageRows.length}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[SEO Snapshot] 수집 실패:', reason)
    await safeBotLog({
      botType: 'CMO',
      action: 'SEO_SNAPSHOT',
      status: 'FAILED',
      details: JSON.stringify({ error: reason, rangeEnd }),
      executionTimeMs: Date.now() - startedAt,
    })
    await sendSlackMessage('SYSTEM', `🔴 *주간 SEO 스냅샷 실패*\n원인: ${reason}`)
    throw err
  }
}

/**
 * top-level await로 실행한다. runner.ts는 `import(...).then(() => {})`로 핸들러를 부르는데,
 * import는 **모듈 평가 완료**까지만 기다린다. main()을 그냥 호출해두면 GSC 응답을 받기 전에
 * runner가 process.exit()를 때려 BotLog·Slack이 남지 않는다(실제로 그렇게 조용히 죽었다).
 * top-level await면 import가 main 완료까지 기다린다.
 */
await main()
