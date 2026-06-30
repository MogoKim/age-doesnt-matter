// DailyKpiSnapshot 기반 파생 지표 — admin analytics 히스토리 UX용.
// EventLog 재집계 없이 스냅샷 row만 가공한다. (공식 기준 = 스냅샷 = EventLog 1회 집계분)

export interface SnapshotRow {
  id: string
  date: string
  uv: number
  pv: number
  memberUv: number
  guestUv: number
  newSignups: number
  conversionRate: number | null
  userPosts: number
  userComments: number
  wau: number
  realCustomers: number
  channels: unknown
  retention: unknown
  dataQuality: unknown
  updatedAt: Date
}

export interface ChannelStat { channel: string; sessions: number; signups30d: number; signupRate: number | null }
export type Level = '좋음' | '주의' | '위험'
export interface Badge { key: string; level: Level }
export interface KpiCard {
  key: string
  label: string
  value: string
  deltaPct: number | null // 전일 대비 %, null = 비교불가
  spark: number[] // 최근 7일 오름차순
  note: string
}
export interface KpiHistory {
  latestDate: string
  updatedAt: string
  uv: number
  pvPerUv: number | null
  newSignups: number
  wau: number
  d7: number | null
  d1: number | null
  uvVsAvg7Pct: number | null // 7일 평균 대비 UV
  badges: Badge[]
  statusSentences: string[]
  cards: KpiCard[]
  channels: ChannelStat[]
  weekOverWeek: { uv: number; pv: number; signups: number } | null // 14일+ 누적 시에만
  hasPrev: boolean
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const round1 = (n: number) => Math.round(n * 10) / 10
function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}
function retRate(retention: unknown, key: 'd1' | 'd7'): number | null {
  const r = retention as Record<string, { rate?: number | null }> | null
  const v = r?.[key]?.rate
  return typeof v === 'number' ? v : null
}
function parseChannels(raw: unknown): ChannelStat[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => {
      const o = c as Record<string, unknown>
      return {
        channel: typeof o.channel === 'string' ? o.channel : '기타',
        sessions: num(o.sessions),
        signups30d: num(o.signups30d),
        signupRate: typeof o.signupRate === 'number' ? o.signupRate : null,
      }
    })
    .sort((a, b) => b.sessions - a.sessions)
}

// rows: date desc (rows[0] = 최신)
export function deriveKpiHistory(rows: SnapshotRow[]): KpiHistory | null {
  if (rows.length === 0) return null
  const latest = rows[0]
  const prev = rows[1] ?? null
  const hasPrev = !!prev
  const last7Desc = rows.slice(0, 7)
  const last7Asc = [...last7Desc].reverse()
  const avg = (sel: (r: SnapshotRow) => number) =>
    last7Asc.length ? last7Asc.reduce((s, r) => s + sel(r), 0) / last7Asc.length : 0

  const pvPerUv = latest.uv > 0 ? round1(latest.pv / latest.uv) : null
  const d7 = retRate(latest.retention, 'd7')
  const d1 = retRate(latest.retention, 'd1')
  const avgUv = avg((r) => r.uv)
  const uvVsAvg7Pct = avgUv > 0 ? Math.round(((latest.uv - avgUv) / avgUv) * 100) : null

  // ── 상태 뱃지 ──
  const inflowLvl: Level =
    avgUv === 0 ? '주의' : latest.uv >= avgUv * 0.85 ? '좋음' : latest.uv >= avgUv * 0.6 ? '주의' : '위험'
  const signupLvl: Level = latest.newSignups >= 3 ? '좋음' : latest.newSignups >= 1 ? '주의' : '위험'
  const wauDelta = prev ? deltaPct(latest.wau, prev.wau) : null
  const activeLvl: Level =
    wauDelta === null ? '주의' : wauDelta >= -5 ? '좋음' : wauDelta >= -20 ? '주의' : '위험'
  const retentionLvl: Level = d7 === null ? '주의' : d7 >= 5 ? '좋음' : d7 >= 1 ? '주의' : '위험'
  const badges: Badge[] = [
    { key: '유입', level: inflowLvl },
    { key: '가입', level: signupLvl },
    { key: '활성', level: activeLvl },
    { key: '리텐션', level: retentionLvl },
  ]

  // ── 상태 문장 (사람이 바로 이해) ──
  const channels = parseChannels(latest.channels)
  const deadChannel = channels.find((c) => c.sessions >= 300 && c.signups30d === 0)
  const sentences: string[] = []
  // 유입
  if (uvVsAvg7Pct === null) sentences.push(`UV ${latest.uv.toLocaleString('ko-KR')}명입니다.`)
  else if (Math.abs(uvVsAvg7Pct) <= 10) sentences.push(`유입(UV ${latest.uv.toLocaleString('ko-KR')})은 7일 평균 근처입니다.`)
  else sentences.push(`유입(UV ${latest.uv.toLocaleString('ko-KR')})이 7일 평균 대비 ${uvVsAvg7Pct > 0 ? '+' : ''}${uvVsAvg7Pct}%입니다.`)
  // 가입
  if (latest.newSignups === 0) sentences.push('신규가입이 0명입니다.')
  // 활성
  if (wauDelta !== null && wauDelta <= -20) sentences.push(`WAU가 ${prev!.wau}→${latest.wau}로 하락 중입니다.`)
  // 채널 품질
  if (deadChannel) sentences.push(`${deadChannel.channel} 유입은 많지만 가입이 없어 전환 품질 점검이 필요합니다.`)
  // 리텐션 보조
  if (d7 !== null && d7 < 1) sentences.push(`D7 재방문율이 ${d7}%로 낮습니다.`)

  // ── KPI 카드 ──
  const card = (key: string, label: string, value: string, cur: number, sel: (r: SnapshotRow) => number, note: string): KpiCard => ({
    key, label, value,
    deltaPct: prev ? deltaPct(cur, sel(prev)) : null,
    spark: last7Asc.map(sel),
    note,
  })
  const cards: KpiCard[] = [
    card('uv', 'UV (일 방문)', latest.uv.toLocaleString('ko-KR'), latest.uv, (r) => r.uv,
      uvVsAvg7Pct === null ? '7일 평균 대비 비교불가' : `7일 평균 대비 ${uvVsAvg7Pct > 0 ? '+' : ''}${uvVsAvg7Pct}%`),
    { key: 'pvuv', label: 'PV/UV (체류 깊이)', value: pvPerUv === null ? '–' : `${pvPerUv}`, deltaPct: null,
      spark: last7Asc.map((r) => (r.uv > 0 ? r.pv / r.uv : 0)), note: '높을수록 1인당 더 많이 봄' },
    card('signups', '신규가입', `${latest.newSignups}`, latest.newSignups, (r) => r.newSignups,
      latest.newSignups === 0 ? '오늘 가입 0명' : '실고객 가입(봇 제외)'),
    card('wau', 'WAU (주간활성)', latest.wau.toLocaleString('ko-KR'), latest.wau, (r) => r.wau,
      wauDelta === null ? '전일 비교불가' : wauDelta < 0 ? '하락 추세 주의' : '유지/상승'),
    { key: 'd7', label: 'D7 리텐션', value: d7 === null ? '–' : `${d7}%`, deltaPct: null,
      spark: last7Asc.map((r) => retRate(r.retention, 'd7') ?? 0), note: '비회원 7일 재방문(성숙 코호트)' },
  ]

  // ── 전주 대비 (14일+ 누적 시에만) ──
  let weekOverWeek: KpiHistory['weekOverWeek'] = null
  if (rows.length >= 14) {
    const thisWeek = rows.slice(0, 7)
    const priorWeek = rows.slice(7, 14)
    const sum = (arr: SnapshotRow[], sel: (r: SnapshotRow) => number) => arr.reduce((s, r) => s + sel(r), 0)
    const wow = (sel: (r: SnapshotRow) => number) => {
      const p = sum(priorWeek, sel)
      return p === 0 ? 0 : Math.round(((sum(thisWeek, sel) - p) / p) * 100)
    }
    weekOverWeek = { uv: wow((r) => r.uv), pv: wow((r) => r.pv), signups: wow((r) => r.newSignups) }
  }

  return {
    latestDate: latest.date,
    updatedAt: latest.updatedAt instanceof Date ? latest.updatedAt.toISOString() : String(latest.updatedAt),
    uv: latest.uv,
    pvPerUv,
    newSignups: latest.newSignups,
    wau: latest.wau,
    d7,
    d1,
    uvVsAvg7Pct,
    badges,
    statusSentences: sentences,
    cards,
    channels: channels.slice(0, 5),
    weekOverWeek,
    hasPrev,
  }
}
