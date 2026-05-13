import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const STORAGE_STATE_PATH = '/Users/yanadoo/Documents/New_Claude_agenotmatter/agents/naver-blog/blog-storage-state.json'
const NAVER_BLOG_ID = 'age-doesnt-matter'
const WRITE_URL = `https://blog.naver.com/${NAVER_BLOG_ID}?Redirect=Write&`

async function probeFrame(frame: import('playwright').Frame, label: string) {
  const editables = await frame.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[contenteditable]'))
    return els.map(el => {
      let cur: Element | null = el
      const path: string[] = []
      while (cur && cur !== document.body) {
        let seg = cur.tagName.toLowerCase()
        if ((cur as HTMLElement).id) seg += `#${(cur as HTMLElement).id}`
        const cls = Array.from(cur.classList).slice(0, 4).join('.')
        if (cls) seg += `.${cls}`
        path.unshift(seg)
        cur = cur.parentElement
      }
      return {
        tag: el.tagName,
        id: (el as HTMLElement).id || null,
        class: el.className.toString().slice(0, 100),
        contenteditable: el.getAttribute('contenteditable'),
        placeholder: el.getAttribute('placeholder') || (el as HTMLElement).dataset?.placeholder || null,
        text: (el.textContent || '').trim().slice(0, 40),
        path: path.slice(-5).join(' > '),
      }
    })
  }).catch(() => [])

  if (editables.length > 0) {
    console.log(`\n── FRAME [${label}] contenteditable 요소 ${editables.length}개 ──`)
    for (const e of editables) {
      console.log(`  id=${e.id || '-'} | ce=${e.contenteditable}`)
      console.log(`  class: ${e.class}`)
      console.log(`  placeholder: ${e.placeholder || '-'} | text: ${e.text || '-'}`)
      console.log(`  path: ${e.path}`)
      console.log()
    }
  }

  const buttons = await frame.evaluate(() => {
    const checks = [
      { sel: '.publish_btn', label: '발행 버튼(.publish_btn)' },
      { sel: 'button[class*="publish"]', label: 'button publish' },
      { sel: '[class*="publish"]', label: 'publish 클래스' },
      { sel: '[class*="Publish"]', label: 'Publish 클래스' },
      { sel: '#tag_input', label: 'tag_input id' },
      { sel: 'input[placeholder*="태그"]', label: '태그 placeholder input' },
      { sel: '[placeholder*="태그"]', label: '태그 placeholder 전체' },
      { sel: '[class*="tag"]', label: 'tag 클래스' },
      { sel: '[data-se-menu-item]', label: 'data-se-menu-item 전체' },
      { sel: '[data-se-menu-item="photo"]', label: '사진 메뉴아이템' },
      { sel: 'button[title*="사진"]', label: '사진 title' },
      { sel: '[class*="photo"]', label: 'photo 클래스' },
      { sel: '[class*="se-title"]', label: 'se-title 클래스' },
      { sel: '.se-title-input', label: 'se-title-input' },
      { sel: '[class*="se-text"]', label: 'se-text 클래스' },
    ]
    return checks.flatMap(c => {
      const els = Array.from(document.querySelectorAll(c.sel))
      if (els.length === 0) return []
      return [{
        label: c.label,
        sel: c.sel,
        count: els.length,
        first: {
          tag: els[0].tagName,
          id: (els[0] as HTMLElement).id || null,
          class: els[0].className.toString().slice(0, 100),
          text: (els[0] as HTMLElement).innerText?.slice(0, 30) || (els[0].textContent || '').slice(0, 30),
        },
        all: els.slice(0, 3).map(e => ({
          tag: e.tagName,
          id: (e as HTMLElement).id || null,
          class: e.className.toString().slice(0, 80),
          attr: Object.fromEntries(Array.from(e.attributes).map(a => [a.name, a.value.slice(0, 50)])),
        }))
      }]
    })
  }).catch(() => [])

  if (buttons.length > 0) {
    console.log(`── FRAME [${label}] 주요 요소 ──`)
    for (const b of buttons) {
      console.log(`  ✅ [${b.label}] count=${b.count}`)
      for (const el of b.all) {
        console.log(`     ${el.tag} id=${el.id || '-'} class=${el.class}`)
        const attrStr = Object.entries(el.attr).map(([k,v]) => `${k}="${v}"`).join(' ')
        if (attrStr) console.log(`     attrs: ${attrStr}`)
      }
    }
    console.log()
  }
}

async function main() {
  const storageState = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8'))

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-dev-shm-usage'],
  })

  const context = await browser.newContext({
    storageState,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })

  const page = await context.newPage()

  console.log('[Probe] 글쓰기 페이지 진입:', WRITE_URL)
  await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await new Promise(r => setTimeout(r, 5000))

  // 도움말 팝업 닫기 — iframe 내부에서
  const editorFrameEarly = page.frames().find(f => f.url().includes('PostWriteForm.naver'))
  if (editorFrameEarly) {
    // se-help-title 클래스로 도움말 패널 확인 후 닫기
    const helpPanel = await editorFrameEarly.$('h1.se-help-title, [class*="container__HW"]')
    if (helpPanel) {
      // 컨테이너 내부 버튼 클릭 (X 닫기)
      const closeBtn = await editorFrameEarly.$('[class*="container__HW"] button, .se-help-panel button, [class*="help"] button')
      if (closeBtn) {
        await closeBtn.click()
        console.log('[Probe] 도움말 패널 닫음 (버튼 클릭)')
      } else {
        await editorFrameEarly.press('body', 'Escape')
        console.log('[Probe] 도움말 패널 닫음 (Escape)')
      }
      await new Promise(r => setTimeout(r, 800))
    }
  }

  const url = page.url()
  console.log('[Probe] 최종 URL:', url)

  if (url.includes('nid.naver.com') || url.includes('nidlogin')) {
    console.error('[Probe] ❌ 로그인 페이지 리다이렉트 — 세션 만료')
    await browser.close()
    return
  }

  const frames = page.frames()
  console.log(`[Probe] 프레임 수: ${frames.length}`)
  for (const [i, f] of frames.entries()) {
    console.log(`  [${i}] ${f.url().slice(0, 100)}`)
  }

  // 메인 + 모든 iframe 탐색
  for (const [i, frame] of frames.entries()) {
    await probeFrame(frame, `${i}: ${frame.url().slice(0, 50)}`)
  }

  // iframe(Frame 1 = PostWriteForm)에서 발행 버튼 클릭
  const editorFrame = frames.find(f => f.url().includes('PostWriteForm.naver'))
  console.log('\n[Probe] 발행 버튼 클릭 시도 (iframe 내부)...')

  let publishClicked = false
  if (editorFrame) {
    // 도움말 오버레이 JS로 강제 제거
    const removed = await editorFrame.evaluate(() => {
      const overlay = document.querySelector('[class*="container__HW"]') as HTMLElement
      if (overlay) { overlay.style.display = 'none'; return true }
      // se-help-title 부모도 시도
      const h1 = document.querySelector('h1.se-help-title')
      const parent = h1?.closest('[class*="container"]') as HTMLElement | null
      if (parent) { parent.style.display = 'none'; return true }
      return false
    }).catch(() => false)
    console.log(`[Probe] 도움말 JS 제거: ${removed}`)
    await new Promise(r => setTimeout(r, 300))

    // evaluate로 직접 click() 호출 (interceptor 우회)
    const clicked = await editorFrame.evaluate(() => {
      const btn = document.querySelector('[data-click-area="tpb.publish"]') as HTMLButtonElement
      if (btn) { btn.click(); return true }
      return false
    }).catch(() => false)
    console.log(`[Probe] 발행 버튼 JS click: ${clicked}`)
    publishClicked = !!clicked
  }

  if (publishClicked) {
    await new Promise(r => setTimeout(r, 2000))
    console.log('\n[Probe] === 발행 패널 열린 후 탐색 ===')
    // 패널은 메인 page 또는 iframe 모두 확인
    for (const [i, frame] of page.frames().entries()) {
      await probeFrame(frame, `패널 후 [${i}]`)
    }
    // tag input 특별 탐색
    if (editorFrame) {
      const tagInfo = await editorFrame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable]'))
        return inputs.map(el => ({
          tag: el.tagName,
          id: (el as HTMLElement).id || null,
          class: el.className.toString().slice(0, 100),
          placeholder: (el as HTMLInputElement).placeholder || el.getAttribute('placeholder') || null,
          name: (el as HTMLInputElement).name || null,
          type: (el as HTMLInputElement).type || null,
        }))
      }).catch(() => [])
      console.log('\n[Probe] 패널 후 모든 input/textarea:')
      for (const t of tagInfo) {
        console.log(`  ${t.tag} id=${t.id} type=${t.type} name=${t.name} placeholder=${t.placeholder} class=${t.class}`)
      }
    }
  } else {
    console.log('[Probe] 발행 버튼을 찾지 못함')
  }

  console.log('\n[Probe] 20초 대기 (브라우저 DevTools 확인 가능)...')
  await new Promise(r => setTimeout(r, 20_000))
  await browser.close()
  console.log('[Probe] 완료')
}

main().catch(err => {
  console.error('[Probe] 오류:', err)
  process.exit(1)
})
