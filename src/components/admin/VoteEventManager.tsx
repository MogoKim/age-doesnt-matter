'use client'

import { useState, useTransition } from 'react'
import {
  upsertTodayVoteEvent,
  updateVoteDisplayNumbers,
  setVoteStatus,
  requestVoteDrafts,
  requestVotePostDraft,
  registerBotComments,
  deleteReservedVoteEvent,
} from '@/app/admin/(panel)/vote-events/actions'
import { voteVisibleStatus } from '@/lib/vote-status'

export interface VoteEventData {
  id: string
  date: string // 'YYYY-MM-DD' (KST) — 09:00 전 노출 판정용
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostId: string | null
  seedCountA: number
  seedCountB: number
  displayViews: number
}

/** 예약/지난 목록 항목 (page.tsx에서 조립) */
export interface VoteEventListItem {
  id: string
  date: string // 'YYYY-MM-DD'
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostId: string | null
  seedTotal: number
  realVotes: number
  displayViews: number
}

/** 'YYYY-MM-DD'(KST 자정 UTC) → 운영 상태 라벨 (voteVisibleStatus + linkedPostId 조합) */
function statusLabel(item: { date: string; status: 'OPEN' | 'CLOSED'; linkedPostId: string | null }): string {
  const d = new Date(`${item.date}T00:00:00.000Z`)
  const vis = voteVisibleStatus(item.status, d)
  const linked = item.linkedPostId ? '게시글 연결됨' : '게시글 없음'
  if (vis === 'HIDDEN') return `⏰ 09:00 전 대기 · ${linked}`
  if (vis === 'CLOSED') return item.status === 'CLOSED' ? `🔒 수동 마감 · ${linked}` : `✅ 자동 마감 · ${linked}`
  // OPEN
  return item.linkedPostId ? '🟢 진행 중 · 팝업/HERO 노출 가능' : '🟠 진행 중 · 게시글 없음(노출 불가)'
}

export interface VoteStats {
  displayA: number
  displayB: number
  userVotes: number
  guestVotes: number
  botBallots: number
  realComments: number
}

export interface BotOption {
  id: string
  nickname: string
}

interface BotRow {
  botUserId: string
  camp: 'A' | 'B'
  content: string
}

const MAX_BOT_ROWS = 5

export default function VoteEventManager({
  event,
  stats,
  botOptions,
  upcoming = [],
  past = [],
}: {
  event: VoteEventData | null
  stats: VoteStats | null
  botOptions: BotOption[]
  upcoming?: VoteEventListItem[]
  past?: VoteEventListItem[]
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'upcoming' | 'past'>('today')

  // 예약 생성 폼 (예약/예정 탭)
  const [schedDate, setSchedDate] = useState('')
  const [schedQuestion, setSchedQuestion] = useState('')
  const [schedOptionA, setSchedOptionA] = useState('')
  const [schedOptionB, setSchedOptionB] = useState('')
  const [schedContent, setSchedContent] = useState('') // AI/직접 본문 (비우면 템플릿)

  // 투표 생성/수정 폼
  const [question, setQuestion] = useState(event?.question ?? '')
  const [optionA, setOptionA] = useState(event?.optionA ?? '')
  const [optionB, setOptionB] = useState(event?.optionB ?? '')
  const [linkedPostId, setLinkedPostId] = useState(event?.linkedPostId ?? '')
  const [postContent, setPostContent] = useState('') // AI/직접 본문 (비우면 템플릿, 신규 생성 시만)
  const [aiPending, setAiPending] = useState(false)

  // 본문 AI 초안 — 클릭 1회 = API 1회. 실패해도 폼 저장은 무관(템플릿 유지)
  const draftPostBody = (q: string, a: string, b: string, set: (v: string) => void) => {
    if (aiPending) return
    setMsg(null)
    setAiPending(true)
    startTransition(async () => {
      const result = await requestVotePostDraft({ question: q, optionA: a, optionB: b })
      setAiPending(false)
      if (result.error) setMsg(`❌ ${result.error}`)
      else if (result.body) {
        set(result.body)
        setMsg('✅ AI 본문 초안을 채웠습니다 — 수정 후 저장하세요')
      }
    })
  }

  // 수치 조작
  const [seedA, setSeedA] = useState(event?.seedCountA ?? 0)
  const [seedB, setSeedB] = useState(event?.seedCountB ?? 0)
  const [views, setViews] = useState(event?.displayViews ?? 0)

  // 봇 댓글 다중 row (최대 5)
  const [botRows, setBotRows] = useState<BotRow[]>([
    { botUserId: botOptions[0]?.id ?? '', camp: 'A', content: '' },
  ])

  const run = (fn: () => Promise<{ error?: string; ok?: boolean; registered?: number }>, okMsg: string) => {
    setMsg(null)
    startTransition(async () => {
      const result = await fn()
      setMsg(result.error ? `❌ ${result.error}` : `✅ ${okMsg}`)
      if (!result.error) window.location.reload()
    })
  }

  // 예약 투표 삭제 — confirm 후 서버 action. 서버가 조건 재검증하므로 클라 가드는 UX용
  const deleteEvent = (item: VoteEventListItem) => {
    if (!confirm(`${item.date} 예약 투표를 삭제할까요?\n연결된 임시(DRAFT) 게시글도 함께 삭제됩니다. 되돌릴 수 없습니다.`)) return
    run(() => deleteReservedVoteEvent(item.id), '예약 투표가 삭제되었습니다 (같은 날짜로 다시 만들 수 있어요)')
  }

  const displayA = event ? seedA + (stats ? stats.displayA - event.seedCountA : 0) : 0
  const displayB = event ? seedB + (stats ? stats.displayB - event.seedCountB : 0) : 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🎛 참여 이벤트 — 오늘의 투표</h1>
      <div className="flex gap-2 border-b border-zinc-200">
        {([
          ['today', '오늘 진행'],
          ['upcoming', `예약·예정${upcoming.length ? ` (${upcoming.length})` : ''}`],
          ['past', `지난 투표${past.length ? ` (${past.length})` : ''}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === k ? 'border-[#FF6F61] text-[#FF6F61]' : 'border-transparent text-zinc-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {msg && <div className="rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</div>}

      {tab === 'today' && (
        <>
      {/* linkedPostId 누락 — 저장 시 자동 생성으로 해소 */}
      {event && !event.linkedPostId && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ <b>연동 게시글이 아직 없습니다.</b> 지금은 홈 팝업·HERO 투표 입구가 노출되지 않습니다.
          아래 ① 섹션에서 <b>&ldquo;수정 저장&rdquo;</b>을 누르면 투표용 게시글이 자동 생성·연결됩니다.
        </div>
      )}

      {/* ── 통계 카드 (표시 수치) ── */}
      {event && stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label={`A · ${event.optionA} (표시)`} value={stats.displayA} />
          <StatCard label={`B · ${event.optionB} (표시)`} value={stats.displayB} />
          <StatCard label="표시 참여자 (A+B 자동)" value={stats.displayA + stats.displayB} />
          <StatCard label="표시 조회수" value={event.displayViews} />
        </div>
      )}

      {/* ── 실측 지표 (봇·seed와 절대 분리) ── */}
      {event && stats && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="mb-2 text-sm font-bold text-rose-700">
            실측 지표 — 조작·봇과 무관한 진짜 숫자
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="실 회원 표" value={stats.userVotes} accent />
            <StatCard label="게스트 표" value={stats.guestVotes} accent />
            <StatCard label="실 댓글 (봇 제외)" value={stats.realComments} accent />
            <StatCard label="투표 경유 가입" value="—" accent />
          </div>
          <p className="mt-2 text-xs text-rose-600">
            봇 배지용 ballot {stats.botBallots}건은 표시/실측 표수 어디에도 포함되지 않습니다.
          </p>
        </div>
      )}

      {/* ── 오늘 투표 생성/수정 ── */}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-bold">
          ① 오늘 투표 {event ? '수정' : '생성'}{' '}
          <span className="text-xs font-normal text-zinc-500">(KST 기준 하루 1투표)</span>
        </h2>
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="질문 — 예: 우리 집 남편은 어느 쪽인가요?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              placeholder="선택지 A — 예: 잔소리형"
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
            />
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              placeholder="선택지 B — 예: 무뚝뚝형"
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
            />
          </div>
          {/* 연동 게시글 상태 — 운영자는 DB id를 다룰 필요 없음. 09:00 전 DRAFT면 공개 URL 대신 어드민 편집 */}
          {event?.linkedPostId ? (
            voteVisibleStatus(event.status, new Date(`${event.date}T00:00:00.000Z`)) === 'HIDDEN' ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
                🔒 09:00 전 비공개
                <a href={`/admin/content/${event.linkedPostId}`} target="_blank" rel="noreferrer" className="font-bold underline">
                  예약 글 미리보기·수정
                </a>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                ✅ 연동 게시글 연결됨
                <a
                  href={`/community/stories/${event.linkedPostId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline"
                >
                  연동 게시글 열기 ↗
                </a>
              </div>
            )
          ) : (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
              연동 게시글: <b>자동 생성됨</b> — 저장하면 투표용 게시글이 만들어지고 자동으로 연결됩니다.
            </p>
          )}

          {/* 고급: 기존 게시글 ID를 직접 연결할 때만 (비우면 자동 생성) */}
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-500">고급 · 기존 게시글 ID 직접 연결</summary>
            <input
              className="mt-2 w-full rounded-lg border px-3 py-2"
              placeholder="linkedPostId 직접 입력 (비우면 자동 생성)"
              value={linkedPostId}
              onChange={(e) => setLinkedPostId(e.target.value)}
            />
          </details>

          {/* 게시글 본문 초안 — 신규 생성 시에만 적용. 비우면 템플릿. 기존 글은 '예약 글 미리보기·수정'에서 편집 */}
          {!event?.linkedPostId && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-700">게시글 본문 (선택 · 비우면 기본 템플릿)</span>
                <button
                  className="rounded-lg border border-[#4A6CF7] px-3 py-1.5 text-xs font-bold text-[#4A6CF7] disabled:opacity-50"
                  disabled={pending || aiPending || !question || !optionA || !optionB}
                  onClick={() => draftPostBody(question, optionA, optionB, setPostContent)}
                >
                  ✨ AI 본문 초안 (1회 호출)
                </button>
              </div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={5}
                placeholder="AI 초안을 받거나 직접 입력 (사연형 5~8줄 HTML). 비우면 기본 템플릿으로 생성됩니다."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-400">
                AI는 초안만 채웁니다 — 자동 발행하지 않습니다. 저장 시 이 본문으로 게시글이 생성됩니다.
              </p>
            </div>
          )}

          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  upsertTodayVoteEvent({
                    question,
                    optionA,
                    optionB,
                    linkedPostId: linkedPostId || null,
                    content: postContent.trim() || undefined,
                  }),
                '저장되었습니다 (연동 게시글 자동 생성·연결)',
              )
            }
          >
            {event ? '수정 저장' : '오늘 투표 생성 (게시글 자동 생성)'}
          </button>
        </div>
      </section>

      {event && (
        <>
          {/* ── 수치 조작 ── */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-bold">
              ② 수치 조작 <span className="text-xs font-normal text-zinc-500">seed 표·표시 조회수 (실측과 분리 저장)</span>
            </h2>
            <div className="space-y-2">
              <NumberRow
                label={`A · ${event.optionA} seed`}
                value={seedA}
                onChange={setSeedA}
                hint={`표시 ${displayA}표 = seed ${seedA} + 실 표`}
              />
              <NumberRow
                label={`B · ${event.optionB} seed`}
                value={seedB}
                onChange={setSeedB}
                hint={`표시 ${displayB}표 = seed ${seedB} + 실 표`}
              />
              <NumberRow label="표시 조회수" value={views} onChange={setViews} step={50} />
              <button
                className="rounded-lg bg-[#FF6F61] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      updateVoteDisplayNumbers({
                        voteEventId: event.id,
                        seedCountA: seedA,
                        seedCountB: seedB,
                        displayViews: views,
                      }),
                    '수치가 적용되었습니다',
                  )
                }
              >
                적용
              </button>
              <p className="text-xs text-zinc-500">
                표시 참여자 수는 항상 A+B 합계로 자동 계산됩니다 (별도 입력 없음 — 불일치 방지).
              </p>
            </div>
          </section>

          {/* ── 상태 제어 ── */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-bold">③ 상태 제어</h2>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  event.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                현재: {event.status === 'OPEN' ? '진행 중 (OPEN)' : '마감 (CLOSED)'}
              </span>
              <button
                className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setVoteStatus(event.id, event.status === 'OPEN' ? 'CLOSED' : 'OPEN'),
                    '상태가 전환되었습니다',
                  )
                }
              >
                {event.status === 'OPEN' ? '결과 모드로 전환 (CLOSED)' : '다시 열기 (OPEN)'}
              </button>
            </div>
          </section>

          {/* ── 봇 댓글 등록 (다중 row 일괄) ── */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-1 font-bold">④ 봇 댓글 등록</h2>
            <p className="mb-3 text-xs text-zinc-500">
              여러 봇 선택 → AI 초안 일괄 생성(클릭 1회 = API 1회, CLAUDE_MODEL_LIGHT 전용) → 수정 → 일괄 등록.
              최대 {MAX_BOT_ROWS}개. 등록된 봇 댓글에는 진영 배지가 붙고, 실측 지표에는 포함되지 않습니다.
            </p>

            {!event.linkedPostId && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                연동 게시글(linkedPostId)을 먼저 설정해야 등록할 수 있습니다.
              </p>
            )}

            <div className="space-y-3">
              {botRows.map((row, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      value={row.botUserId}
                      onChange={(e) => updateRow(i, { botUserId: e.target.value })}
                    >
                      {botOptions.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nickname}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      value={row.camp}
                      onChange={(e) => updateRow(i, { camp: e.target.value as 'A' | 'B' })}
                    >
                      <option value="A">{event.optionA}파</option>
                      <option value="B">{event.optionB}파</option>
                    </select>
                    <button
                      className="ml-auto text-sm text-zinc-400 hover:text-red-500"
                      onClick={() => setBotRows((rows) => rows.filter((_, k) => k !== i))}
                      disabled={botRows.length <= 1}
                    >
                      row 삭제
                    </button>
                  </div>
                  <textarea
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    rows={2}
                    placeholder="댓글 초안 — AI 초안을 받거나 직접 입력 (직접 입력은 AI 비용 0)"
                    value={row.content}
                    onChange={(e) => updateRow(i, { content: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50"
                disabled={botRows.length >= MAX_BOT_ROWS}
                onClick={() =>
                  setBotRows((rows) => [...rows, { botUserId: botOptions[0]?.id ?? '', camp: 'B', content: '' }])
                }
              >
                + 봇 추가 ({botRows.length}/{MAX_BOT_ROWS})
              </button>
              <button
                className="rounded-lg border border-[#4A6CF7] px-4 py-2 text-sm font-bold text-[#4A6CF7] disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  // 클릭 시에만 1회 호출 — 자동 호출 금지
                  setMsg(null)
                  startTransition(async () => {
                    const result = await requestVoteDrafts({
                      voteEventId: event.id,
                      rows: botRows.map((r) => ({
                        personaName: botOptions.find((b) => b.id === r.botUserId)?.nickname ?? '회원',
                        camp: r.camp,
                      })),
                    })
                    if (result.error) {
                      setMsg(`❌ ${result.error}`)
                    } else if (result.drafts) {
                      setBotRows((rows) =>
                        rows.map((r, i) => ({ ...r, content: result.drafts![i] ?? r.content })),
                      )
                      setMsg('✅ AI 초안을 채웠습니다 — 수정 후 등록하세요')
                    }
                  })
                }}
              >
                ✨ AI 초안 받기 (1회 호출)
              </button>
              <button
                className="rounded-lg bg-[#FF6F61] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={pending || !event.linkedPostId}
                onClick={() =>
                  run(
                    () =>
                      registerBotComments({
                        voteEventId: event.id,
                        rows: botRows.map((r) => ({ botUserId: r.botUserId, camp: r.camp, content: r.content })),
                      }),
                    '봇 댓글이 등록되었습니다',
                  )
                }
              >
                댓글 일괄 등록
              </button>
            </div>
          </section>
        </>
      )}
        </>
      )}

      {/* ── 예약·예정 탭 ── */}
      {tab === 'upcoming' && (
        <section className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-bold">
              새 예약 만들기{' '}
              <span className="text-xs font-normal text-zinc-500">
                (미래 날짜 · 09:00 오픈 / 20:00 마감 · 연동 게시글 자동 생성)
              </span>
            </h2>
            <div className="space-y-2">
              <input
                type="date"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="질문 — 예: 갱년기, 더 힘든 건 어느 쪽인가요?"
                value={schedQuestion}
                onChange={(e) => setSchedQuestion(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border px-3 py-2"
                  placeholder="선택지 A"
                  value={schedOptionA}
                  onChange={(e) => setSchedOptionA(e.target.value)}
                />
                <input
                  className="flex-1 rounded-lg border px-3 py-2"
                  placeholder="선택지 B"
                  value={schedOptionB}
                  onChange={(e) => setSchedOptionB(e.target.value)}
                />
              </div>
              {/* 예약 게시글 본문 초안 — 비우면 템플릿. AI는 초안만(자동 발행 없음) */}
              <div className="rounded-lg border border-dashed border-zinc-300 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-700">게시글 본문 (선택 · 비우면 기본 템플릿)</span>
                  <button
                    className="rounded-lg border border-[#4A6CF7] px-3 py-1.5 text-xs font-bold text-[#4A6CF7] disabled:opacity-50"
                    disabled={pending || aiPending || !schedQuestion || !schedOptionA || !schedOptionB}
                    onClick={() => draftPostBody(schedQuestion, schedOptionA, schedOptionB, setSchedContent)}
                  >
                    ✨ AI 본문 초안 (1회 호출)
                  </button>
                </div>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={5}
                  placeholder="AI 초안을 받거나 직접 입력 (사연형 5~8줄 HTML). 비우면 기본 템플릿."
                  value={schedContent}
                  onChange={(e) => setSchedContent(e.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-400">
                  09:00 전에는 &lsquo;예약 글 미리보기·수정&rsquo;에서 더 다듬을 수 있습니다.
                </p>
              </div>
              <button
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      upsertTodayVoteEvent({
                        question: schedQuestion,
                        optionA: schedOptionA,
                        optionB: schedOptionB,
                        linkedPostId: null,
                        date: schedDate,
                        content: schedContent.trim() || undefined,
                      }),
                    '예약 저장 (연동 게시글 자동 생성·연결)됨',
                  )
                }
              >
                예약 저장 (게시글 자동 생성)
              </button>
              <p className="text-xs text-zinc-500">같은 날짜 중복은 자동 방지(수정으로 처리). 날짜 비우면 오늘로 저장됩니다.</p>
            </div>
          </div>
          <EventList items={upcoming} emptyText="예약된 투표가 없습니다." onDelete={deleteEvent} />
        </section>
      )}

      {/* ── 지난 투표 탭 ── */}
      {tab === 'past' && (
        <section className="space-y-4">
          <EventList
            items={past}
            emptyText="지난 투표가 없습니다."
            showResult
            onDuplicate={(item) => {
              setTab('upcoming')
              setSchedQuestion(item.question)
              setSchedOptionA(item.optionA)
              setSchedOptionB(item.optionB)
              setSchedDate('')
              setMsg('📋 복제됨 — 예약·예정 탭에서 날짜만 선택 후 저장하세요')
            }}
          />
        </section>
      )}
    </div>
  )

  function updateRow(index: number, patch: Partial<BotRow>) {
    setBotRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
}

/** 예약/지난 목록 렌더 — 날짜·질문·상태라벨·표수·게시글링크·복제 */
function EventList({
  items,
  emptyText,
  showResult = false,
  onDuplicate,
  onDelete,
}: {
  items: VoteEventListItem[]
  emptyText: string
  showResult?: boolean
  onDuplicate?: (item: VoteEventListItem) => void
  onDelete?: (item: VoteEventListItem) => void
}) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-zinc-700">{item.date}</span>
            <span className="text-xs text-zinc-500">{statusLabel(item)}</span>
          </div>
          <p className="mt-1 font-bold text-zinc-900 break-keep">{item.question}</p>
          <p className="mt-0.5 text-sm text-zinc-500">
            {item.optionA} vs {item.optionB}
            {showResult && ` · 표 ${item.seedTotal + item.realVotes} (seed ${item.seedTotal}+실표 ${item.realVotes}) · 조회 ${item.displayViews}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.linkedPostId &&
              (voteVisibleStatus(item.status, new Date(`${item.date}T00:00:00.000Z`)) === 'HIDDEN' ? (
                <>
                  <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-500">🔒 09:00 전 비공개</span>
                  <a
                    href={`/admin/content/${item.linkedPostId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700"
                  >
                    예약 글 미리보기·수정
                  </a>
                </>
              ) : (
                <a
                  href={`/community/stories/${item.linkedPostId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700"
                >
                  게시글 열기 ↗
                </a>
              ))}
            {onDuplicate && (
              <button
                onClick={() => onDuplicate(item)}
                className="rounded-lg border border-[#FF6F61] px-3 py-1.5 text-xs font-bold text-[#FF6F61]"
              >
                복제
              </button>
            )}
            {/* 삭제: 09:00 오픈 전(HIDDEN) + 실 표 0 예약만 노출 (서버가 조건 재검증) */}
            {onDelete &&
              voteVisibleStatus(item.status, new Date(`${item.date}T00:00:00.000Z`)) === 'HIDDEN' &&
              item.realVotes === 0 && (
                <button
                  onClick={() => onDelete(item)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${accent ? 'bg-white' : 'bg-zinc-50'}`}>
      <div className={`text-xl font-extrabold ${accent ? 'text-rose-600' : ''}`}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </div>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  hint?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-44 text-sm font-semibold">{label}</span>
      <input
        type="number"
        className="w-28 rounded-lg border px-2 py-1.5 text-sm"
        value={value}
        min={0}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
      <button className="rounded border px-2 py-1 text-xs" onClick={() => onChange(value + step)}>
        +{step}
      </button>
      <button className="rounded border px-2 py-1 text-xs" onClick={() => onChange(value + step * 10)}>
        +{step * 10}
      </button>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  )
}
