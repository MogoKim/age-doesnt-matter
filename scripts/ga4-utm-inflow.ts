// 2026-06-01~오늘 기준 — 웹 링크 5종 정확매칭 + SNS/네이버 채널 실제 유입 전수.
// 실행: tsx --env-file=.env.local scripts/ga4-utm-inflow.ts
import { google } from 'googleapis'

const PROPERTY_ID = process.env.GA4_PROPERTY_ID
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
const START = '2026-06-01'

const LINKS = [
  { label: '네이버블로그-매거진', source: 'naver', medium: 'blog', campaign: 'magazine' },
  { label: '네이버블로그-체험단', source: 'naver', medium: 'blog', campaign: 'experience' },
  { label: '스레드', source: 'threads', medium: 'social', campaign: 'post' },
  { label: '인스타그램', source: 'instagram', medium: 'social', campaign: 'post' },
  { label: '페이스북', source: 'facebook', medium: 'social', campaign: 'post' },
]
const CH_SRC = ['naver', 'naver_blog', 'threads', 'instagram', 'ig', 'facebook', 'l.threads.com', 'facebook.com', 'm.facebook.com', 'l.instagram.com', 'm.blog.naver.com', 'blog.naver.com']

async function main() {
  if (!PROPERTY_ID || !SA_JSON) { console.error('env 없음'); process.exit(1) }
  const credentials = JSON.parse(Buffer.from(SA_JSON, 'base64').toString('utf8')) as { client_email: string; private_key: string }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  const data = google.analyticsdata({ version: 'v1beta', auth })
  const property = `properties/${PROPERTY_ID}`

  const res = await data.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate: START, endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'keyEvents' }],
      limit: '500',
    },
  })
  const rows = res.data.rows ?? []
  const get = (src: string, med: string, camp: string) => {
    let s = 0, u = 0, n = 0, k = 0, found = false
    for (const r of rows) {
      const d = (r.dimensionValues ?? []).map((x) => (x.value ?? '').toLowerCase())
      if (d[0] === src && d[1] === med && d[2] === camp) {
        const m = (r.metricValues ?? []).map((x) => +(x.value ?? '0')); s += m[0]; u += m[1]; n += m[2]; k += m[3]; found = true
      }
    }
    return { s, u, n, k, found }
  }

  console.log(`\n========== [${START} ~ 오늘] 웹 링크 5종 정확 매칭 ==========`)
  console.log(['링크'.padEnd(20), '세션', '유저', '신규', '가입'].join(' | '))
  for (const L of LINKS) {
    const r = get(L.source, L.medium, L.campaign)
    console.log([L.label.padEnd(18), String(r.s).padStart(4), String(r.u).padStart(4), String(r.n).padStart(4), String(r.k).padStart(4)].join(' | ') + (r.found ? '' : '  ← 0'))
  }

  console.log(`\n========== [${START} ~ 오늘] SNS/네이버 채널 실제 유입 (태그 무관, 세션>0) ==========`)
  console.log(['source', 'medium', 'campaign', '세션', '신규', '가입'].join(' | '))
  const sorted = rows
    .filter((r) => CH_SRC.includes((r.dimensionValues?.[0]?.value ?? '').toLowerCase()) && +(r.metricValues?.[0]?.value ?? '0') > 0)
    .sort((a, b) => +(b.metricValues?.[0]?.value ?? '0') - +(a.metricValues?.[0]?.value ?? '0'))
  for (const r of sorted) {
    const d = (r.dimensionValues ?? []).map((x) => x.value ?? '')
    const m = (r.metricValues ?? []).map((x) => +(x.value ?? '0'))
    console.log([d[0], d[1], d[2], String(m[0]).padStart(4), String(m[2]).padStart(4), String(m[3]).padStart(4)].join(' | '))
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1) })
