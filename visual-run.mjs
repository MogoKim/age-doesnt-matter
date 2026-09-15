import { chromium } from '@playwright/test'
const BASE = process.argv[2], OUT = process.argv[3]
const VIEWPORTS = [{n:'320',w:320,h:720},{n:'390',w:390,h:844},{n:'1440',w:1440,h:900}]
const PAGES = [{n:'home',p:'/'},{n:'community',p:'/community/stories'},{n:'magazine',p:'/magazine'},{n:'jobs',p:'/jobs'},{n:'login',p:'/login'}]
const b = await chromium.launch()
const rows = []
for (const v of VIEWPORTS) {
  const ctx = await b.newContext({ viewport:{width:v.w,height:v.h}, extraHTTPHeaders:{'x-bot-type':'verify'} })
  const pg = await ctx.newPage()
  for (const p of PAGES) {
    let status = 0
    try { const r = await pg.goto(BASE+p.p,{waitUntil:'domcontentloaded',timeout:45000}); status = r?.status() ?? 0 } catch { status = -1 }
    await pg.waitForTimeout(700)
    const m = await pg.evaluate(() => {
      const de = document.documentElement
      const overflow = de.scrollWidth - de.clientWidth
      let small = 0, tiny = 0, controls = 0
      for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (getComputedStyle(el).display === 'inline') continue
        controls++
        if (r.height < 44) small++
        if (r.height < 24) tiny++
      }
      // 텍스트 겹침 근사 — 본문 요소가 뷰포트를 넘는지
      let over = 0
      for (const el of document.querySelectorAll('p,h1,h2,h3,span')) {
        const r = el.getBoundingClientRect()
        if (r.width > de.clientWidth + 1) over++
      }
      return { overflow, controls, small, tiny, over }
    })
    rows.push({ page:p.n, vp:v.n, status, ...m })
    await pg.screenshot({ path:`${OUT}/${p.n}-${v.n}.png` })
  }
  await ctx.close()
}
await b.close()
console.log(JSON.stringify(rows))
