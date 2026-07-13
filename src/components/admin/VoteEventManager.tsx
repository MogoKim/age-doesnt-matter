'use client'

import { useState, useTransition } from 'react'
import {
  upsertTodayVoteEvent,
  updateVoteDisplayNumbers,
  setVoteStatus,
  requestVoteDrafts,
  registerBotComments,
} from '@/app/admin/(panel)/vote-events/actions'

export interface VoteEventData {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostId: string | null
  seedCountA: number
  seedCountB: number
  displayViews: number
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
}: {
  event: VoteEventData | null
  stats: VoteStats | null
  botOptions: BotOption[]
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // 투표 생성/수정 폼
  const [question, setQuestion] = useState(event?.question ?? '')
  const [optionA, setOptionA] = useState(event?.optionA ?? '')
  const [optionB, setOptionB] = useState(event?.optionB ?? '')
  const [linkedPostId, setLinkedPostId] = useState(event?.linkedPostId ?? '')

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

  const displayA = event ? seedA + (stats ? stats.displayA - event.seedCountA : 0) : 0
  const displayB = event ? seedB + (stats ? stats.displayB - event.seedCountB : 0) : 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🎛 오늘의 투표 통제판</h1>
      {msg && <div className="rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</div>}

      {/* linkedPostId 누락 — HERO teaser·팝업이 게시글로 못 보내고 fallback으로 동작 */}
      {event && !event.linkedPostId && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ <b>연동 게시글(linkedPostId)이 비어 있습니다.</b> 홈 HERO 투표 슬라이드가 커뮤니티
          목록(/community/stories)으로 fallback 이동하고, 투표 안내 팝업은 노출되지 않으며, 게시글 내
          투표 모듈도 없습니다. ① 섹션에서 연동 게시글 ID를 설정해 주세요.
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
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="연동 게시글 ID (linkedPostId) — 댓글 수다 공간"
            value={linkedPostId}
            onChange={(e) => setLinkedPostId(e.target.value)}
          />
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              run(
                () => upsertTodayVoteEvent({ question, optionA, optionB, linkedPostId: linkedPostId || null }),
                '저장되었습니다',
              )
            }
          >
            {event ? '수정 저장' : '오늘 투표 생성'}
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
    </div>
  )

  function updateRow(index: number, patch: Partial<BotRow>) {
    setBotRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
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
