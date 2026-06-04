// 거울 보드 브라우저 칸반 — SSE 구독 후 카드를 컬럼에 배치.
// 순수 vanilla JS (타입체크 대상 아님). evaluateBoardState() 결과 형태에 의존.
'use strict'

var COLUMNS = [
  { key: 'PENDING', label: '지금 가능', color: '#9ca3af' },
  { key: 'DOING', label: '진행 / 문제', color: '#f59e0b' },
  { key: 'REVIEW', label: '적용 확인', color: '#3b82f6' },
  { key: 'DONE', label: '완료', color: '#22c55e' },
]

function hasNullProbe(card) {
  var p = card.probes || {}
  if (p.git && p.git.ok === null) return true
  if (p.ci && p.ci.ok === null) return true
  if (p.http && p.http.some(function (h) { return h.ok === null })) return true
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
