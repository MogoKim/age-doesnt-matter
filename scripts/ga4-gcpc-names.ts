// GA4 실제 google/cpc 캠페인명 찾기 (자동태깅이 utm_campaign 덮어씀) + 체류/이탈
import { google } from 'googleapis'
const PID = process.env.GA4_PROPERTY_ID, SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
async function main() {
  if (!PID || !SA) { console.error('env'); process.exit(1) }
  const credentials = JSON.parse(Buffer.from(SA, 'base64').toString('utf8')) as { client_email: string; private_key: string }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  const data = google.analyticsdata({ version: 'v1beta', auth })
  const res = await data.properties.runReport({
    property: `properties/${PID}`, requestBody: {
      dateRanges: [{ startDate: '2daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }, { name: 'keyEvents' }],
      dimensionFilter: { filter: { fieldName: 'sessionMedium', stringFilter: { value: 'cpc' } } },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: '30',
    },
  })
  console.log('=== GA4 google/cpc 캠페인 (최근 2일) ===')
  console.log(['campaign', '세션', '평균체류', '이탈률', '가입'].join(' | '))
  for (const r of res.data.rows ?? []) {
    const d = (r.dimensionValues ?? []).map((x) => x.value ?? '')
    const m = (r.metricValues ?? []).map((x) => x.value ?? '0')
    console.log(`${d[0]} | ${m[0]} | ${Math.round(+m[1])}초 | ${(+m[2] * 100).toFixed(0)}% | ${m[3]}`)
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1) })
