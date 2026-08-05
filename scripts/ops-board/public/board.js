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
 * 운영 원장 — compact row. 첫 화면의 주인은 probe가 아니라 이쪽이다.
 * merge는 종결이 아니다. 배포도 종결이 아니다. 운영검증 PASS만 종결이다.
 * ────────────────────────────────────────────────────────────────────────── */
var L_ORDER = ['절대누락금지', '배포완료-적용확인만', '지금가능', '백로그']
var L_HEAD = {
  '절대누락금지': '🔴 절대 누락 금지',
  '배포완료-적용확인만': '⏳ 배포 완료, 적용 확인만 남음',
  '지금가능': '▶ 지금 바로 할 수 있음',
  '백로그': '📌 백로그 — 고객 임팩트/리텐션 순',
}
var L_SUM = {
  '절대누락금지': '🔴 절대누락',
  '배포완료-적용확인만': '⏳ 운영검증 대기',
  '지금가능': '▶ 지금 가능',
  '백로그': '📌 백로그',
}
/* 이 세션의 workstream. 다른 owner 항목은 흐리게(읽기 전용처럼) */
var MY_STREAM = 'claude-ops'

function whenLabel(it) {
  var w = it.trigger || it.due
  if (!w) return ''
  return String(w).replace('T', ' ').replace(/\+09:00$/, '').slice(0, 16)
}

function ledgerRow(e) {
  var it = e.item
  var bad = e.overdue || e.issues.some(function (i) { return i.level === 'error' })
  var locked = it.owner_session !== MY_STREAM && it.owner_session !== 'unassigned'
  var el = document.createElement('div')
  el.className = 'row' + (bad ? ' alert' : '') + (locked ? ' locked' : '')

  var when = whenLabel(it)
  var goal = it.pass_criteria || it.close_condition || ''
  var warns = e.issues.map(function (i) { return i.message }).join(' · ')

  el.innerHTML =
    '<div class="r1">' +
      '<span class="b ' + escapeHtml(String(it.priority).toLowerCase()) + '">' + escapeHtml(it.priority) + '</span>' +
      '<span class="b st">' + escapeHtml(it.status) + '</span>' +
      '<span class="t">' + (locked ? '🔒 ' : '') + escapeHtml(it.title) + '</span>' +
    '</div>' +
    '<div class="r2"><b>다음</b>' + escapeHtml(it.next_action || '(없음)') + '</div>' +
    '<div class="r2"><b>종결</b>' + escapeHtml(goal || '(없음)') + '</div>' +
    '<div class="r3">' +
      '<span>' + escapeHtml(it.owner_session) + '</span>' +
      (when ? '<span>⏰ ' + escapeHtml(when) + '</span>' : '') +
      (warns ? '<span class="warn">⚠ ' + escapeHtml(warns) + '</span>' : '') +
    '</div>'
  return el
}

function renderSummary(state) {
  var box = document.getElementById('summary')
  if (!box) return
  box.innerHTML = ''
  for (var i = 0; i < L_ORDER.length; i++) {
    var col = L_ORDER[i]
    var n = state.counts[col] || 0
    var d = document.createElement('div')
    d.className = 'sm' + (col === '절대누락금지' && n > 0 ? ' hot' : '')
    d.innerHTML = '<div class="n">' + n + '</div><div class="l">' + L_SUM[col] + '</div>'
    box.appendChild(d)
  }
}

function renderLedger(state) {
  var root = document.getElementById('ledger')
  if (!root) return
  renderSummary(state)
  root.innerHTML = ''

  var open = state.items.filter(function (e) { return e.item.status !== 'verified_closed' })
  var closed = state.items.filter(function (e) { return e.item.status === 'verified_closed' })

  for (var c = 0; c < L_ORDER.length; c++) {
    var col = L_ORDER[c]
    var items = open.filter(function (e) { return e.column === col })
    if (!items.length) continue                       // 빈 섹션은 공간을 차지하지 않는다
    var sec = document.createElement('section')
    sec.className = 'lsec'
    sec.innerHTML = '<h2>' + L_HEAD[col] + ' <span class="c">' + items.length + '</span></h2>'
    for (var i = 0; i < items.length; i++) sec.appendChild(ledgerRow(items[i]))
    root.appendChild(sec)
  }

  if (closed.length) {
    var d = document.createElement('details')
    d.className = 'closed-box'
    d.innerHTML = '<summary>✅ 검증 완료 종결 ' + closed.length + '건</summary>'
    for (var k = 0; k < closed.length; k++) d.appendChild(ledgerRow(closed[k]))
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
