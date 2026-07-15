'use client'

import { useState, useTransition } from 'react'
import {
  upsertFeedbackEvent,
  deleteFeedbackEvent,
  requestFeedbackDraft,
} from '@/app/admin/(panel)/vote-events/actions'

export interface FeedbackEventItem {
  id: string
  title: string
  description: string | null
  bodyPostId: string | null
  startAt: string // ISO(UTC)
  endAt: string // ISO(UTC)
  isActive: boolean
  tier: 'PRIMARY' | 'SECONDARY' | 'HIDDEN'
  realOpinions: number
  bucket: 'today' | 'upcoming' | 'past'
}

/** UTC ISO → datetime-local 값('YYYY-MM-DDTHH:mm', KST) */
function toKstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 16)
}

const TABS = [
  ['today', '오늘 진행'],
  ['upcoming', '예약·예정'],
  ['past', '지난 이벤트'],
] as const

export default function FeedbackEventForm({ items }: { items: FeedbackEventItem[] }) {
  const [pending, startTransition] = useTransition()
  const [aiPending, setAiPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'upcoming' | 'past'>('today')

  // 폼 상태 (신규/수정 공용)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [tier, setTier] = useState<'PRIMARY' | 'SECONDARY' | 'HIDDEN'>('SECONDARY')

  const resetForm = () => {
    setEditingId(null); setTitle(''); setDescription(''); setContent(''); setStartAt(''); setEndAt(''); setTier('SECONDARY')
  }

  const startEdit = (it: FeedbackEventItem) => {
    setEditingId(it.id)
    setTitle(it.title)
    setDescription(it.description ?? '')
    setContent('') // 본문은 비워두면 기존 유지, 입력 시에만 교체
    setStartAt(toKstLocal(it.startAt))
    setEndAt(toKstLocal(it.endAt))
    setTier(it.tier)
    setMsg('✏️ 수정 모드 — 본문을 비워두면 기존 본문이 유지됩니다')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, okMsg: string) => {
    setMsg(null)
    startTransition(async () => {
      const result = await fn()
      setMsg(result.error ? `❌ ${result.error}` : `✅ ${okMsg}`)
      if (!result.error) window.location.reload()
    })
  }

  const draftBody = () => {
    if (aiPending || !title.trim()) return
    setMsg(null); setAiPending(true)
    startTransition(async () => {
      const result = await requestFeedbackDraft({ title, description })
      setAiPending(false)
      if (result.error) setMsg(`❌ ${result.error}`)
      else if (result.body) { setContent(result.body); setMsg('✅ AI 본문 초안을 채웠습니다 — 수정 후 저장하세요') }
    })
  }

  const save = () => {
    run(
      () => upsertFeedbackEvent({
        eventId: editingId ?? undefined,
        title, description, content: content.trim() || undefined,
        startAt, endAt, tier,
      }),
      editingId ? '의견수렴 이벤트가 수정되었습니다' : '의견수렴 이벤트가 생성되었습니다',
    )
  }

  const del = (it: FeedbackEventItem) => {
    if (it.realOpinions > 0) { setMsg('❌ 실 의견이 있어 삭제할 수 없습니다'); return }
    if (!confirm(`"${it.title}" 의견수렴 이벤트를 삭제할까요?\n연결된 본문 게시글도 함께 삭제됩니다. 되돌릴 수 없습니다.`)) return
    run(() => deleteFeedbackEvent(it.id), '의견수렴 이벤트가 삭제되었습니다')
  }

  const list = items.filter((it) => it.bucket === tab)

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</div>}

      {/* ── 생성/수정 폼 ── */}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-bold">
          {editingId ? '✏️ 의견수렴 이벤트 수정' : '① 새 의견수렴 이벤트'}{' '}
          <span className="text-xs font-normal text-zinc-500">(자유 의견 받기 — 투표 아님)</span>
        </h2>
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="제목 — 예: 우리 서비스, 이런 점 고쳐주세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="안내문(선택) — 예: 불편했던 점·바라는 점 편하게 남겨주세요"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="rounded-lg border border-dashed border-zinc-300 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-700">본문 (선택 · 비우면 기본 템플릿)</span>
              <button
                className="rounded-lg border border-[#4A6CF7] px-3 py-1.5 text-xs font-bold text-[#4A6CF7] disabled:opacity-50"
                disabled={pending || aiPending || !title.trim()}
                onClick={draftBody}
              >
                ✨ AI 본문 초안 (1회 호출)
              </button>
            </div>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={5}
              placeholder="AI 초안을 받거나 직접 입력 (안내 3~5줄 HTML). 비우면 기본 템플릿."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-400">AI는 초안만 채웁니다 — 자동 발행하지 않습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col text-xs text-zinc-500">
              시작 (KST)
              <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs text-zinc-500">
              종료 (KST)
              <input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs text-zinc-500">
              tier
              <select className="rounded-lg border px-3 py-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value as 'PRIMARY' | 'SECONDARY' | 'HIDDEN')}>
                <option value="SECONDARY">SECONDARY</option>
                <option value="PRIMARY">PRIMARY</option>
                <option value="HIDDEN">HIDDEN</option>
              </select>
            </label>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⓘ 팝업·HERO 노출은 <b>Phase 3b 예정</b>입니다. 지금은 <b>푸시·직접 링크</b>로만 진입합니다.
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              disabled={pending || !title.trim() || !startAt || !endAt}
              onClick={save}
            >
              {editingId ? '수정 저장' : '의견수렴 이벤트 생성'}
            </button>
            {editingId && (
              <button className="rounded-lg border px-4 py-2 text-sm font-bold text-zinc-600" onClick={resetForm}>
                취소 (새로 만들기)
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 탭 + 목록 ── */}
      <div className="flex gap-2 border-b border-zinc-200">
        {TABS.map(([k, label]) => {
          const n = items.filter((it) => it.bucket === k).length
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === k ? 'border-[#FF6F61] text-[#FF6F61]' : 'border-transparent text-zinc-500'}`}
            >
              {label}{n ? ` (${n})` : ''}
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">해당 이벤트가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {list.map((it) => (
            <div key={it.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">의견</span>
                <span className="text-xs text-zinc-500">
                  {it.isActive ? '' : '⏸ 비활성 · '}
                  {toKstLocal(it.startAt).replace('T', ' ')} ~ {toKstLocal(it.endAt).replace('T', ' ')} · 실 의견 {it.realOpinions}
                </span>
              </div>
              <p className="mt-1 font-bold text-zinc-900 break-keep">{it.title}</p>
              {it.description && <p className="mt-0.5 text-sm text-zinc-500 break-keep">{it.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`/events/${it.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700"
                >
                  미리보기 ↗
                </a>
                <button
                  onClick={() => startEdit(it)}
                  className="rounded-lg border border-[#4A6CF7] px-3 py-1.5 text-xs font-bold text-[#4A6CF7]"
                >
                  수정
                </button>
                {it.realOpinions === 0 && (
                  <button
                    onClick={() => del(it)}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
