// 홈 hydration 진단 — 깨끗한 Chromium 컨텍스트에서 N회 반복.
// 자사 요청에는 x-bot-type 을 붙인다(GA4·EventLog 오염 방지).
import { chromium } from '@playwright/test'

const url = process.argv[2]
const runs = Number(process.argv[3] ?? 5)
const label = process.argv[4] ?? ''
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

const browser = await chromium.launch()
const out = {}
for (const vp of viewports) {
  let hits = 0
  const samples = []
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      extraHTTPHeaders: { 'x-bot-type': 'qa-hydration-probe' },
    })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    } catch { /* networkidle 타임아웃은 광고 때문 — 그대로 진행 */ }
    await page.waitForTimeout(3000)
    const found = errs.filter((e) => /React error #418|Hydration failed|hydrat/i.test(e))
    if (found.length) { hits++; if (samples.length < 1) samples.push(found[0].slice(0, 200)) }
    await ctx.close()
  }
  out[vp.name] = { hits, runs, samples }
}
await browser.close()
console.log(`\n=== ${label || url} ===`)
for (const [k, v] of Object.entries(out)) {
  console.log(`  ${k.padEnd(8)} React#418: ${v.hits}/${v.runs}`)
  for (const s of v.samples) console.log(`      ${s}`)
}
