#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const pagesDir = path.join(ROOT, 'assets/qa-report/pages-18')
const journeysDir = path.join(ROOT, 'assets/qa-report/journeys-19')
const uxFile = path.join(ROOT, 'assets/qa-report/20-ux-writing-result.json')
const outFile = path.join(ROOT, 'assets/review/qa-report.html')

const pageOrder = ['/', '/about', '/grade', '/contact', '/terms', '/privacy', '/rules', '/faq', '/search', '/best', '/community', '/magazine', '/jobs', '/login']

const pages = fs.readdirSync(pagesDir).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(pagesDir, f), 'utf8')))
  .sort((a, b) => {
    const ai = pageOrder.indexOf(a.url)
    const bi = pageOrder.indexOf(b.url)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

const journeys = fs.readdirSync(journeysDir).filter(f => f.endsWith('.json'))
  .sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(journeysDir, f), 'utf8')))

const ux = JSON.parse(fs.readFileSync(uxFile, 'utf8'))

const totalFail = pages.reduce((n, p) => n + p.issues.filter(i => i.level === 'FAIL').length, 0)
  + journeys.reduce((n, j) => n + j.steps.filter(s => s.status === 'FAIL').length, 0)
  + ux.summary.forbiddenWordFails

const totalWarn = pages.reduce((n, p) => n + p.issues.filter(i => i.level === 'WARN').length, 0)
  + journeys.reduce((n, j) => n + j.steps.filter(s => s.status === 'WARN').length, 0)
  + ux.summary.accessibilityWarnings

function esc(s) {
  if (!s) return ''
  return String(s)
    .replace(/\x1B\[[0-9;]*m/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ms(n) { return n > 0 ? (n / 1000).toFixed(1) + 's' : '-' }

function levelBadge(level) {
  if (level === 'FAIL') return '<span class="badge fail">FAIL</span>'
  if (level === 'WARN') return '<span class="badge warn">WARN</span>'
  return '<span class="badge ok">OK</span>'
}

// ── 페이지 테이블 rows ──────────────────────────────────────────────────────
const pageRows = pages.map(p => {
  const failCount = p.issues.filter(i => i.level === 'FAIL').length
  const warnCount = p.issues.filter(i => i.level === 'WARN').length
  const rowClass = failCount > 0 ? 'row-fail' : warnCount > 0 ? 'row-warn' : ''
  const issueHtml = p.issues.map(i =>
    `<div class="issue-item">${levelBadge(i.level)} ${esc(i.message)}</div>`
  ).join('')
  const httpCell = p.httpStatus === 200
    ? '<span class="ok-mark">200</span>'
    : `<span class="fail-mark">${p.httpStatus}</span>`
  return `<tr class="${rowClass}">
    <td><strong>${esc(p.label)}</strong><br><code>${esc(p.url)}</code></td>
    <td>${httpCell}</td>
    <td>${ms(p.performance.fcp)}</td>
    <td class="${p.performance.lcp > 4000 ? 'cell-fail' : p.performance.lcp > 2500 ? 'cell-warn' : ''}">${ms(p.performance.lcp)}</td>
    <td class="${p.performance.cls > 0.25 ? 'cell-fail' : p.performance.cls > 0.1 ? 'cell-warn' : ''}">${p.performance.cls}</td>
    <td>${ms(p.performance.ttfb)}</td>
    <td>${p.hasH1 ? '<span class="ok-mark">O</span>' : '<span class="warn-mark">X</span>'}</td>
    <td>${p.ogTitle ? 'O' : '<span class="warn-mark">X</span>'} / ${p.ogImage ? 'O' : '<span class="warn-mark">X</span>'}</td>
    <td>${p.imagesMissingAlt > 0 ? `<span class="warn-mark">${p.imagesMissingAlt}개</span>` : '<span class="ok-mark">0</span>'}</td>
    <td>${issueHtml || '<span class="dim">없음</span>'}</td>
  </tr>`
}).join('')

// ── 여정 섹션 ──────────────────────────────────────────────────────────────
const journeySections = journeys.map(j => {
  const failCount = j.steps.filter(s => s.status === 'FAIL').length
  const warnCount = j.steps.filter(s => s.status === 'WARN').length
  const headerClass = failCount > 0 ? 'jh-fail' : warnCount > 0 ? 'jh-warn' : 'jh-ok'
  const icon = failCount > 0 ? '&#10060;' : warnCount > 0 ? '&#9888;' : '&#10003;'

  const stepsHtml = j.steps.map(s => {
    const cls = s.status === 'FAIL' ? 'step-fail' : s.status === 'WARN' ? 'step-warn' : 'step-ok'
    const stepIcon = s.status === 'FAIL' ? '&#10060;' : s.status === 'WARN' ? '&#9888;' : '&#10003;'
    return `<div class="step ${cls}">
      <span class="step-icon">${stepIcon}</span>
      <span class="step-name">${esc(s.step)}</span>
      <span class="step-dur">${s.durationMs}ms</span>
      ${s.issue ? `<div class="step-issue">${esc(s.issue)}</div>` : ''}
    </div>`
  }).join('')

  return `<div class="journey-card">
    <div class="journey-header ${headerClass}">
      <span>${icon} ${esc(j.journey)}</span>
      <span class="journey-meta">총 ${ms(j.totalDurationMs)} | 이슈 ${j.issueCount}건</span>
    </div>
    ${stepsHtml}
  </div>`
}).join('')

// ── CTA 테이블 ─────────────────────────────────────────────────────────────
const ctaByType = {}
ux.ctaTexts.forEach(c => {
  if (!ctaByType[c.type]) ctaByType[c.type] = new Set()
  ctaByType[c.type].add(c.text)
})
const ctaRows = Object.entries(ctaByType).map(([type, texts]) => {
  const arr = [...texts]
  const inconsistent = arr.length > 1
  return `<tr class="${inconsistent ? 'row-warn' : ''}">
    <td>${esc(type)}</td>
    <td>${arr.map(t => `<code>${esc(t)}</code>`).join(' / ')}</td>
    <td>${inconsistent ? `<span class="warn-mark">혼재 ${arr.length}가지</span>` : '<span class="ok-mark">일관</span>'}</td>
  </tr>`
}).join('')

// ── HTML ───────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>우나어 QA 감사 리포트</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a1a; font-size: 14px; }
.header { background: #16213e; color: white; padding: 20px 32px; position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.header h1 { font-size: 17px; font-weight: 700; }
.header .sub { font-size: 11px; color: #8899bb; margin-top: 2px; }
.spacer { flex: 1; }
.stat-box { background: rgba(255,255,255,.12); border-radius: 8px; padding: 8px 18px; text-align: center; min-width: 80px; }
.stat-box .num { font-size: 24px; font-weight: 800; line-height: 1; }
.stat-box.fail .num { color: #ff6b6b; }
.stat-box.warn .num { color: #ffd93d; }
.stat-box .lbl { font-size: 10px; color: #aaa; margin-top: 2px; }
.main { max-width: 1440px; margin: 0 auto; padding: 20px 16px; }
.section { background: white; border-radius: 10px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.section-title { padding: 14px 20px; background: #f7f8fa; border-bottom: 1px solid #eaeaea; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 10px; }
.cnt-badge { font-size: 11px; background: #e5e7eb; border-radius: 20px; padding: 2px 10px; font-weight: 400; color: #555; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #f9fafb; padding: 9px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; white-space: nowrap; }
td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
tr.row-fail { background: #fff5f5; }
tr.row-warn { background: #fffbf0; }
tr.row-fail:hover { background: #ffe8e8; }
tr.row-warn:hover { background: #fff3d0; }
.fail-mark { color: #cc0000; font-weight: 700; }
.warn-mark { color: #b45309; font-weight: 600; }
.ok-mark { color: #166534; }
.dim { color: #9ca3af; font-size: 11px; }
.badge { display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
.badge.fail { background: #fee2e2; color: #991b1b; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.ok { background: #d1fae5; color: #065f46; }
.issue-item { font-size: 11px; margin: 2px 0; }
.cell-fail { color: #cc0000; font-weight: 700; }
.cell-warn { color: #b45309; font-weight: 600; }
code { font-family: 'Menlo', monospace; background: #f1f3f5; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
.journey-card { border: 1px solid #e5e7eb; border-radius: 8px; margin: 12px 16px; overflow: hidden; }
.journey-header { padding: 11px 14px; font-weight: 700; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
.jh-fail { background: #fee2e2; color: #7f1d1d; }
.jh-warn { background: #fef3c7; color: #78350f; }
.jh-ok { background: #d1fae5; color: #064e3b; }
.journey-meta { font-size: 11px; font-weight: 400; opacity: .8; }
.step { display: flex; align-items: flex-start; gap: 8px; padding: 7px 14px; border-top: 1px solid #f0f0f0; flex-wrap: wrap; font-size: 12px; }
.step-fail { background: #fff5f5; }
.step-warn { background: #fffbf0; }
.step-icon { width: 18px; flex-shrink: 0; }
.step-name { flex: 1; min-width: 160px; }
.step-dur { color: #9ca3af; font-size: 11px; white-space: nowrap; }
.step-issue { width: 100%; font-size: 11px; color: #b45309; background: #fff7ed; padding: 4px 8px; border-radius: 4px; margin-top: 3px; font-family: monospace; word-break: break-all; white-space: pre-wrap; max-height: 80px; overflow: auto; }
.ux-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; padding: 16px 20px; }
.ux-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
.ux-card h3 { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0; }
.a11y-count { font-size: 22px; font-weight: 800; color: #b45309; }
.footer { font-size: 11px; color: #9ca3af; padding: 12px 20px; text-align: right; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>우나어 QA 감사 리포트</h1>
    <div class="sub">age-doesnt-matter.com — Discovery 전용 | ${new Date(ux.generatedAt).toLocaleString('ko-KR')} 기준</div>
  </div>
  <div class="spacer"></div>
  <div class="stat-box fail">
    <div class="num">${totalFail}</div>
    <div class="lbl">FAIL</div>
  </div>
  <div class="stat-box warn">
    <div class="num">${totalWarn}</div>
    <div class="lbl">WARN</div>
  </div>
</div>

<div class="main">

  <!-- 페이지 감사 -->
  <div class="section">
    <div class="section-title">
      📊 페이지 렌더링 + 성능 감사
      <span class="cnt-badge">${pages.length}개 페이지</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>페이지</th>
          <th>HTTP</th>
          <th>FCP</th>
          <th>LCP</th>
          <th>CLS</th>
          <th>TTFB</th>
          <th>H1</th>
          <th>OG Title/Img</th>
          <th>ALT 누락</th>
          <th>이슈</th>
        </tr>
      </thead>
      <tbody>${pageRows}</tbody>
    </table>
  </div>

  <!-- 여정 감사 -->
  <div class="section">
    <div class="section-title">
      🛤️ 고객 여정 병목 감사
      <span class="cnt-badge">${journeys.length}개 여정</span>
    </div>
    ${journeySections}
    <div style="height:8px"></div>
  </div>

  <!-- UX 라이팅 + 접근성 -->
  <div class="section">
    <div class="section-title">✍️ UX 라이팅 + 접근성 감사</div>
    <div class="ux-grid">
      <div class="ux-card">
        <h3>🚫 금지어 스캔 (시니어·노인·어르신 등)</h3>
        ${ux.summary.forbiddenWordFails === 0
          ? '<p style="color:#065f46">✅ 전체 페이지 금지어 없음</p>'
          : ux.forbiddenWords.map(f =>
              `<div style="font-size:12px;margin:3px 0"><span class="fail-mark">${esc(f.label)}</span> ${esc(f.url)} — "<strong>${esc(f.text)}</strong>"</div>`
            ).join('')
        }
      </div>
      <div class="ux-card">
        <h3>🎯 CTA 문구 일관성</h3>
        <table style="width:100%">
          <tr><th>버튼 타입</th><th>발견된 문구</th><th>일관성</th></tr>
          ${ctaRows}
        </table>
      </div>
      <div class="ux-card">
        <h3>🗂️ 빈 상태(Empty State)</h3>
        ${(ux.summary.emptyStateMissing && ux.summary.emptyStateMissing.length === 0)
          ? '<p style="color:#065f46;font-size:12px">✅ 빈 상태 케이스 미관측 (검색에 결과 있음)</p>'
          : '<p style="color:#b45309;font-size:12px">⚠️ 일부 빈 상태 미확인</p>'
        }
      </div>
      <div class="ux-card">
        <h3>♿ 접근성 샘플링</h3>
        <p class="a11y-count">${ux.summary.accessibilityWarnings}<span style="font-size:14px;font-weight:400;color:#9ca3af">건 경고</span></p>
        <p style="font-size:11px;color:#6b7280;margin-top:6px">터치 타겟 52px 미만 / 폰트 15px 미만 요소</p>
      </div>
    </div>
  </div>

</div>
<div class="footer">생성: ${new Date().toLocaleString('ko-KR')} | Playwright QA 자동 감사</div>
</body>
</html>`

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, html, 'utf8')
console.log('DONE:', outFile, '(' + html.length.toLocaleString() + ' bytes)')
