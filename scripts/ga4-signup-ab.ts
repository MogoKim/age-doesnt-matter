// LOCAL ONLY — GA4 Data API 조회 (서비스계정 자격증명 .env.local 필요). 온디맨드 실행, 크론 불필요.
//
// 회원가입 유도 배너(SignupPromptBanner) A/B/C 실험 성과를 GA4에서 집계한다.
// 노출(signup_banner_shown) / 클릭(signup_banner_clicked) / 가입(sign_up)을
// variant(A·B·C)별로 분해해 클릭률·가입률·승자를 출력한다.
//
// 사용법:
//   npx tsx scripts/ga4-signup-ab.ts            # 최근 90일
//   npx tsx scripts/ga4-signup-ab.ts 30daysAgo  # 기간 지정(GA4 상대 날짜 표기)
//   npx tsx scripts/ga4-signup-ab.ts 2026-04-23 # 절대 날짜(YYYY-MM-DD)
//
// 필요 env(.env.local): GA4_PROPERTY_ID(숫자 속성ID), GOOGLE_SERVICE_ACCOUNT_JSON(base64)
// 서비스계정 unaeo-analytics@... 은 GA4 속성에 '뷰어' 권한이 이미 부여돼 있음.

import { config } from 'dotenv'
import { google } from 'googleapis'

config({ path: '.env.local' })

const PROPERTY_ID = process.env.GA4_PROPERTY_ID
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
const startDate = process.argv[2] || '90daysAgo'

type Variant = 'A' | 'B' | 'C'
const VARIANTS: Variant[] = ['A', 'B', 'C']
const VARIANT_LABEL: Record<Variant, string> = { A: '혜택', B: '재미', C: '공감' }

interface VariantStat {
  shown: number
  clicked: number
  signup: number
}

function pct(a: number, b: number): string {
  return b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`
}

async function main(): Promise<void> {
  if (!PROPERTY_ID || !SA_JSON) {
    console.error('❌ .env.local에 GA4_PROPERTY_ID 또는 GOOGLE_SERVICE_ACCOUNT_JSON이 없습니다.')
    process.exit(1)
  }

  const credentials = JSON.parse(Buffer.from(SA_JSON, 'base64').toString('utf8')) as {
    client_email: string
    private_key: string
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  })
  const data = google.analyticsdata({ version: 'v1beta', auth })

  const res = await data.properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'eventName' }, { name: 'customEvent:variant' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['signup_banner_shown', 'signup_banner_clicked', 'sign_up'] },
        },
      },
    },
  })

  const agg: Record<Variant, VariantStat> = {
    A: { shown: 0, clicked: 0, signup: 0 },
    B: { shown: 0, clicked: 0, signup: 0 },
    C: { shown: 0, clicked: 0, signup: 0 },
  }
  let signupNotSet = 0

  for (const row of res.data.rows ?? []) {
    const ev = row.dimensionValues?.[0]?.value ?? ''
    const v = row.dimensionValues?.[1]?.value ?? ''
    const n = parseInt(row.metricValues?.[0]?.value ?? '0', 10)
    if (!VARIANTS.includes(v as Variant)) {
      if (ev === 'sign_up') signupNotSet += n
      continue
    }
    const slot = agg[v as Variant]
    if (ev === 'signup_banner_shown') slot.shown += n
    else if (ev === 'signup_banner_clicked') slot.clicked += n
    else if (ev === 'sign_up') slot.signup += n
  }

  console.log(`\n📊 회원가입 배너 A/B/C — 기간 ${startDate} ~ today (GA4 property ${PROPERTY_ID})\n`)
  console.log('버전        노출    클릭    클릭률     가입   가입률(노출대비)')
  console.log('─'.repeat(60))

  let best: { v: Variant; ctr: number } | null = null
  let totalShown = 0
  let totalClicked = 0
  let totalSignup = 0
  for (const v of VARIANTS) {
    const s = agg[v]
    totalShown += s.shown
    totalClicked += s.clicked
    totalSignup += s.signup
    const ctr = s.shown ? s.clicked / s.shown : 0
    if (!best || ctr > best.ctr) best = { v, ctr }
    const label = `${v}(${VARIANT_LABEL[v]})`
    console.log(
      `${label.padEnd(10)}${String(s.shown).padStart(6)}${String(s.clicked).padStart(8)}${pct(s.clicked, s.shown).padStart(10)}${String(s.signup).padStart(8)}${pct(s.signup, s.shown).padStart(10)}`,
    )
  }
  console.log('─'.repeat(60))
  console.log(
    `${'합계'.padEnd(9)}${String(totalShown).padStart(6)}${String(totalClicked).padStart(8)}${pct(totalClicked, totalShown).padStart(10)}${String(totalSignup).padStart(8)}`,
  )
  console.log(`\n배너 미경유 / variant 미설정 가입(sign_up not set): ${signupNotSet}`)

  if (best && totalShown > 0) {
    console.log(`\n🏆 클릭률 1위: 버전 ${best.v}(${VARIANT_LABEL[best.v]}) — ${(best.ctr * 100).toFixed(1)}%`)
    if (totalSignup < 30) {
      console.log(`⚠️ 가입 표본(${totalSignup}건)이 작아 통계적 유의성은 약합니다 — 참고용. 표본이 더 쌓이면 다시 확인하세요.`)
    }
  } else {
    console.log('\n(해당 기간 데이터 없음)')
  }
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const err = e as { errors?: { message: string }[]; message?: string }
    console.error('❌ GA4 조회 실패:', err.errors?.[0]?.message || err.message || String(e))
    process.exit(1)
  })
