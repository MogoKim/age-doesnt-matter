'use client'

import { useState, useTransition } from 'react'
import { upsertSurveyEvent, deleteSurveyEvent, getSurveyResults, type SurveyResultsData } from '@/app/admin/(panel)/vote-events/actions'
import { SURVEY_TEMPLATES, QUESTION_TYPE_LABEL, type SurveyQuestion, type SurveyQuestionType } from '@/lib/events/survey'
import SurveyResults from './SurveyResults'

export interface SurveyEventItem {
  id: string
  title: string
  startAt: string // ISO(UTC)
  endAt: string
  isActive: boolean
  tier: 'PRIMARY' | 'SECONDARY' | 'HIDDEN'
  showBottomPopup: boolean
  showHero: boolean
  responseCount: number
  memberCount: number
  guestCount: number
  bucket: 'today' | 'upcoming' | 'past'
  questions: SurveyQuestion[]
  description: string | null
  consentText: string | null
}

function toKstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 16)
}
const uid = () => Math.random().toString(36).slice(2, 9)

const TABS = [['today', '오늘 진행'], ['upcoming', '예약·예정'], ['past', '지난 이벤트']] as const
const CHOICE_TYPES: SurveyQuestionType[] = ['single_choice', 'multiple_choice']

export default function SurveyEventForm({ items }: { items: SurveyEventItem[] }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'upcoming' | 'past'>('today')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [consentText, setConsentText] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [tier, setTier] = useState<'PRIMARY' | 'SECONDARY' | 'HIDDEN'>('SECONDARY')
  const [showBottomPopup, setShowBottomPopup] = useState(false)
  const [showHero, setShowHero] = useState(false)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [results, setResults] = useState<{ id: string; data: SurveyResultsData } | null>(null)

  const resetForm = () => {
    setEditingId(null); setTitle(''); setDescription(''); setConsentText(''); setStartAt(''); setEndAt('')
    setTier('SECONDARY'); setShowBottomPopup(false); setShowHero(false); setQuestions([])
  }
  const loadTemplate = (key: string) => {
    const t = SURVEY_TEMPLATES.find((x) => x.key === key)
    if (!t) return
    setTitle(t.title); setDescription(t.description)
    setQuestions(t.questions.map((q) => ({ ...q, id: uid() })))
    setMsg('📋 템플릿을 불러왔습니다 — 자유롭게 수정하세요')
  }
  const startEdit = (it: SurveyEventItem) => {
    setEditingId(it.id); setTitle(it.title); setDescription(it.description ?? ''); setConsentText(it.consentText ?? '')
    setStartAt(toKstLocal(it.startAt)); setEndAt(toKstLocal(it.endAt)); setTier(it.tier)
    setShowBottomPopup(it.showBottomPopup); setShowHero(it.showHero); setQuestions(it.questions)
    setResults(null); setMsg('✏️ 수정 모드'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setQ = (i: number, patch: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)))
  const addQ = () => setQuestions((qs) => [...qs, { id: uid(), type: 'single_choice', label: '', options: ['', ''], required: true }])
  const rmQ = (i: number) => setQuestions((qs) => qs.filter((_, k) => k !== i))

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, okMsg: string) => {
    setMsg(null)
    startTransition(async () => {
      const r = await fn()
      setMsg(r.error ? `❌ ${r.error}` : `✅ ${okMsg}`)
      if (!r.error) window.location.reload()
    })
  }

  const save = () => run(() => upsertSurveyEvent({
    eventId: editingId ?? undefined, title, description, consentText, startAt, endAt, tier, showBottomPopup, showHero,
    questions: questions.map((q) => CHOICE_TYPES.includes(q.type)
      ? { ...q, options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
      : { id: q.id, type: q.type, label: q.label, required: q.required }),
  }), editingId ? '의견함이 수정되었습니다' : '1분 의견함이 생성되었습니다')

  const del = (it: SurveyEventItem) => {
    if (it.responseCount > 0) { setMsg('❌ 응답이 있어 삭제할 수 없습니다'); return }
    if (!confirm(`"${it.title}" 의견함을 삭제할까요? 되돌릴 수 없습니다.`)) return
    run(() => deleteSurveyEvent(it.id), '의견함이 삭제되었습니다')
  }
  const showResults = (it: SurveyEventItem) => {
    setMsg(null); setResults(null)
    startTransition(async () => {
      const r = await getSurveyResults(it.id)
      if (r.error) setMsg(`❌ ${r.error}`)
      else if (r.results) setResults({ id: it.id, data: r.results })
    })
  }

  const list = items.filter((it) => it.bucket === tab)

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</div>}

      {/* 생성/수정 폼 */}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-bold">{editingId ? '✏️ 1분 의견함 수정' : '① 새 1분 의견함'}</h2>
        <div className="space-y-3">
          {!editingId && (
            <div className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-indigo-700">템플릿 선택 (불러온 뒤 수정 가능 — 완전 자유 빌더 아님)</p>
              <div className="flex flex-wrap gap-2">
                {SURVEY_TEMPLATES.map((t) => (
                  <button key={t.key} onClick={() => loadTemplate(t.key)} className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700">{t.name}</button>
                ))}
              </div>
            </div>
          )}
          <input className="w-full rounded-lg border px-3 py-2" placeholder="제목 — 예: 우나어, 이런 점이 좋아지면 좋겠어요" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="w-full rounded-lg border px-3 py-2" placeholder="안내문(선택) — 예: 1분이면 충분해요" value={description} onChange={(e) => setDescription(e.target.value)} />

          {/* 질문 편집 */}
          <div className="rounded-lg border border-zinc-200 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-zinc-700">질문 ({questions.length})</span>
              <button onClick={addQ} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-zinc-600">+ 질문 추가</button></div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border bg-zinc-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select className="rounded border px-2 py-1 text-sm" value={q.type} onChange={(e) => {
                      const type = e.target.value as SurveyQuestionType
                      setQ(i, { type, options: CHOICE_TYPES.includes(type) ? (q.options?.length ? q.options : ['', '']) : undefined })
                    }}>
                      {(Object.keys(QUESTION_TYPE_LABEL) as SurveyQuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-zinc-600"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} />필수</label>
                    <button onClick={() => rmQ(i)} className="ml-auto text-xs text-zinc-400 hover:text-red-500">질문 삭제</button>
                  </div>
                  <input className="w-full rounded border px-2 py-1.5 text-sm" placeholder="질문 내용" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
                  {CHOICE_TYPES.includes(q.type) && (
                    <textarea className="mt-2 w-full rounded border px-2 py-1.5 text-sm" rows={3} placeholder="선택지 (한 줄에 하나씩, 2개 이상)"
                      value={(q.options ?? []).join('\n')} onChange={(e) => setQ(i, { options: e.target.value.split('\n') })} />
                  )}
                </div>
              ))}
              {questions.length === 0 && <p className="text-xs text-zinc-400">템플릿을 선택하거나 질문을 추가하세요.</p>}
            </div>
          </div>

          <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="동의 문구(선택 · 비우면 기본 문구)" value={consentText} onChange={(e) => setConsentText(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col text-xs text-zinc-500">시작 (KST)<input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
            <label className="flex flex-col text-xs text-zinc-500">종료 (KST)<input type="datetime-local" className="rounded-lg border px-3 py-2 text-sm" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
            <label className="flex flex-col text-xs text-zinc-500">노출 등급 (tier)
              <select className="rounded-lg border px-3 py-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value as 'PRIMARY' | 'SECONDARY' | 'HIDDEN')}>
                <option value="PRIMARY">PRIMARY · 홈 대표 노출</option>
                <option value="SECONDARY">SECONDARY · 링크/푸시용</option>
                <option value="HIDDEN">HIDDEN · 숨김/준비중</option>
              </select>
            </label>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <p className="mb-2 text-xs font-semibold text-zinc-600">홈 노출 채널 <span className="font-normal text-zinc-400">(tier=PRIMARY일 때만 실제 노출 · 입구만, 설문 폼은 상세에서)</span></p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showBottomPopup} onChange={(e) => setShowBottomPopup(e.target.checked)} />하단 팝업</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showHero} onChange={(e) => setShowHero(e.target.checked)} />HERO 배너</label>
            </div>
            {tier !== 'PRIMARY' && (showBottomPopup || showHero) && (
              <p className="mt-2 rounded-md bg-amber-100 px-2.5 py-2 text-xs font-semibold text-amber-800">⚠️ 노출 등급이 {tier}라 팝업/HERO를 켜도 홈에 노출되지 않습니다. PRIMARY로 바꾸세요.</p>
            )}
          </div>

          <div className="flex gap-2">
            <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={pending || !title.trim() || !startAt || !endAt || questions.length === 0} onClick={save}>
              {editingId ? '수정 저장' : '1분 의견함 생성'}
            </button>
            {editingId && <button className="rounded-lg border px-4 py-2 text-sm font-bold text-zinc-600" onClick={resetForm}>취소 (새로 만들기)</button>}
          </div>
        </div>
      </section>

      {/* 탭 + 목록 */}
      <div className="flex gap-2 border-b border-zinc-200">
        {TABS.map(([k, label]) => {
          const n = items.filter((it) => it.bucket === k).length
          return <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === k ? 'border-[#FF6F61] text-[#FF6F61]' : 'border-transparent text-zinc-500'}`}>{label}{n ? ` (${n})` : ''}</button>
        })}
      </div>

      {list.length === 0 ? <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">해당 의견함이 없습니다.</p> : (
        <div className="space-y-2">
          {list.map((it) => (
            <div key={it.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">📝 의견함</span>
                <span className="text-xs text-zinc-500">{it.isActive ? '' : '⏸ 비활성 · '}{toKstLocal(it.startAt).replace('T', ' ')} ~ {toKstLocal(it.endAt).replace('T', ' ')}</span>
              </div>
              <p className="mt-1 font-bold text-zinc-900 break-keep">{it.title}</p>
              <p className="mt-0.5 text-sm text-zinc-500">응답 {it.responseCount} (회원 {it.memberCount} · 비회원 {it.guestCount})</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={`/events/${it.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700">미리보기 ↗</a>
                <button onClick={() => startEdit(it)} className="rounded-lg border border-[#4A6CF7] px-3 py-1.5 text-xs font-bold text-[#4A6CF7]">수정</button>
                <button onClick={() => showResults(it)} className="rounded-lg border border-indigo-400 px-3 py-1.5 text-xs font-bold text-indigo-700">결과 보기</button>
                {it.responseCount === 0 && <button onClick={() => del(it)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">삭제</button>}
              </div>
              {results?.id === it.id && <div className="mt-3 border-t pt-3"><SurveyResults data={results.data} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
