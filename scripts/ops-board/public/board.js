// 거울 보드 브라우저 칸반 — SSE 구독 후 카드를 컬럼에 배치.
// 순수 vanilla JS (타입체크 대상 아님). evaluateBoardState() 결과 형태에 의존.
'use strict'

var COLUMNS = [
  { key: '완료됨', label: '완료됨', color: '#22c55e' },
  { key: '배포완료-적용확인', label: '배포완료·적용확인', color: '#3b82f6' },
  { key: '지금가능', label: '지금 가능', color: '#f59e0b' },
  { key: '백로그', label: '백로그', color: '#9ca3af' },
  { key: '제외', label: '제외 / 무시', color: '#6b7280' },
]

function hasNullProbe(card) {
  var p = card.probes || {}
  if (p.git && p.git.ok === null) return true
  if (p.ci && p.ci.ok === null) return true
  if (p.http && p.http.some(function (h) { return h.ok === null })) return true
  if (p.db && p.db.ok === null) return true
  return false
}

function probeEvidence(card) {
  var p = card.probes || {}
  var parts = []
  if (p.git) parts.push('git:' + p.git.signal)
  if (p.ci) parts.push('ci:' + p.ci.signal)
  if (p.http) {
    var oks = p.http.filter(function (h) { return h.ok === true }).length
    parts.push('http:' + oks + '/' + p.http.length)
  }
  if (p.db) parts.push('db:' + p.db.signal)
  return parts.join(' · ')
}

function fmtTime(iso) {
  return typeof iso === 'string' ? iso.slice(11, 19) : '-'
}

function renderCard(card) {
  var el = document.createElement('div')
  el.className = 'card' + (hasNullProbe(card) ? ' null' : '')
  var stale = card.metaStale ? '<div class="stale">🔍 판정 로직이 90일+ 오래됨 — 재검토</div>' : ''
  var nullNote = hasNullProbe(card) ? '<div class="stale">⚠️ 일부 probe 판정불가</div>' : ''
  el.innerHTML =
    '<div class="title">' + escapeHtml(card.title) + '</div>' +
    '<div class="label">' + escapeHtml(card.label) + '</div>' +
    stale + nullNote +
    '<div class="track">' + escapeHtml(card.track) + '</div>' +
    '<div class="meta">' + escapeHtml(probeEvidence(card)) + '<br/>검증 ' + fmtTime(card.checkedAt) + ' UTC</div>'
  return el
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  })
}

function render(state) {
  var board = document.getElementById('board')
  board.innerHTML = ''
  COLUMNS.forEach(function (colDef) {
    var cards = state.cards.filter(function (c) { return c.column === colDef.key })
    var col = document.createElement('section')
    col.className = 'col'
    col.innerHTML =
      '<h2><span class="badge" style="background:' + colDef.color + '"></span>' +
      colDef.label + ' <span class="count">' + cards.length + '</span></h2>'
    if (cards.length === 0) {
      var empty = document.createElement('div')
      empty.className = 'empty'
      empty.textContent = '—'
      col.appendChild(empty)
    } else {
      cards.forEach(function (card) { col.appendChild(renderCard(card)) })
    }
    board.appendChild(col)
  })
}

function setStatus(html) {
  document.getElementById('status').innerHTML = html
}

function start() {
  var ev = new EventSource('/events')
  ev.onopen = function () { setStatus('<span class="live">● 실시간 연결됨</span>') }
  ev.onmessage = function (e) {
    try {
      var state = JSON.parse(e.data)
      render(state)
      setStatus('<span class="live">● 실시간</span> · 갱신 ' + fmtTime(state.generatedAt) + ' UTC')
    } catch (err) {
      setStatus('<span class="down">파싱 오류</span>')
    }
  }
  ev.onerror = function () { setStatus('<span class="down">● 연결 끊김 — 재연결 중…</span>') }
}

start()

/* ──────────────────────────────────────────────────────────────────────────
 * 운영 원장(Beta) — merge는 종결이 아니다. 운영검증 PASS만 종결이다.
 * probe SSE와 분리된 /ledger 스냅샷을 60초마다 폴링한다.
 * ────────────────────────────────────────────────────────────────────────── */
var LEDGER_COLUMNS = ['절대누락금지', '배포완료-적용확인만', '지금가능', '백로그']
var LEDGER_LABEL = {
  '절대누락금지': '🔴 절대 누락 없이 확인할 것',
  '배포완료-적용확인만': '① 배포 완료, 적용 확인만 남음',
  '지금가능': '② 지금 바로 할 수 있음',
  '백로그': '③ 백로그 — 고객 임팩트/리텐션 순',
}
/* 이 세션의 workstream. 다른 owner는 잠금 표시(읽기 전용처럼 보이게) */
var MY_STREAM = 'claude-ops'

function ledgerCard(e) {
  var it = e.item
  var hasErr = e.issues.some(function (i) { return i.level === 'error' })
  var locked = it.owner_session !== MY_STREAM && it.owner_session !== 'unassigned'
  var cls = 'lcard' + (hasErr || e.overdue ? ' alert' : '') + (locked ? ' locked' : '')
  var when = it.trigger || it.due
  var parts = []
  parts.push('<div class="ltitle">' + (locked ? '<span class="lock">🔒 </span>' : '') + escapeHtml(it.title) + '</div>')
  parts.push('<div class="lmeta">'
    + '<span class="badge ' + escapeHtml(String(it.priority).toLowerCase()) + '">' + escapeHtml(it.priority) + '</span>'
    + '<span class="badge st">' + escapeHtml(it.status) + '</span>'
    + escapeHtml(it.owner_session)
    + (when ? ' · ⏰ ' + escapeHtml(when) : '')
    + '</div>')
  parts.push('<div class="lrow"><b>다음:</b> ' + escapeHtml(it.next_action || '(없음)') + '</div>')
  parts.push('<div class="lrow"><b>종결조건:</b> ' + escapeHtml(it.close_condition || '(없음)') + '</div>')
  if (it.pass_criteria) parts.push('<div class="lrow"><b>PASS:</b> ' + escapeHtml(it.pass_criteria) + '</div>')
  for (var i = 0; i < e.issues.length; i++) {
    parts.push('<div class="lissue">⚠ ' + escapeHtml(e.issues[i].message) + '</div>')
  }
  var el = document.createElement('div')
  el.className = cls
  el.innerHTML = parts.join('')
  return el
}

function renderLedger(state) {
  var root = document.getElementById('ledger')
  if (!root) return
  root.innerHTML = ''

  var head = document.createElement('div')
  head.className = 'ledger-head'
  head.innerHTML = '<h2>운영 원장 (Beta)</h2><div class="sub">'
    + 'merge는 종결이 아니다 · 배포도 종결이 아니다 · <b>운영검증 PASS만 종결</b>'
    + ' — 항목 ' + state.items.length + '건'
    + (state.errorCount ? ' · <span style="color:#fca5a5">필수 누락 ' + state.errorCount + '건</span>' : '')
    + (state.updated ? ' · 갱신 ' + escapeHtml(state.updated) : '')
    + '</div>'
  root.appendChild(head)

  var open = state.items.filter(function (e) { return e.item.status !== 'verified_closed' })
  var closed = state.items.filter(function (e) { return e.item.status === 'verified_closed' })

  for (var c = 0; c < LEDGER_COLUMNS.length; c++) {
    var col = LEDGER_COLUMNS[c]
    var items = open.filter(function (e) { return e.column === col })
    var box = document.createElement('div')
    box.className = 'col'
    box.innerHTML = '<h3>' + LEDGER_LABEL[col] + ' <span style="color:#666">(' + items.length + ')</span></h3>'
    if (!items.length) {
      var em = document.createElement('div'); em.className = 'empty'; em.textContent = '없음'
      box.appendChild(em)
    } else {
      for (var i = 0; i < items.length; i++) box.appendChild(ledgerCard(items[i]))
    }
    root.appendChild(box)
  }

  if (closed.length) {
    var d = document.createElement('details')
    d.className = 'closed-box'
    d.innerHTML = '<summary>✅ 검증 완료 종결 ' + closed.length + '건 (접힘)</summary>'
    for (var k = 0; k < closed.length; k++) d.appendChild(ledgerCard(closed[k]))
    root.appendChild(d)
  }
}

function pollLedger() {
  fetch('/ledger', { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(renderLedger)
    .catch(function () { /* 원장 실패가 probe 보드를 죽이지 않는다 */ })
}
pollLedger()
setInterval(pollLedger, 60000)
