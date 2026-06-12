'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import {
  adminBroadcastPush, searchPushTargets, countPushRecipients,
  schedulePush, listScheduledPushes, cancelScheduledPush,
  type PushTargetUser, type ScheduledPushItem,
} from './actions'

interface Props {
  subUsers: number
  consentUsers: number
}

const GRADE_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'SPROUT', label: '🌱 새싹' },
  { value: 'REGULAR', label: '🌿 단골' },
  { value: 'WARM_NEIGHBOR', label: '☀️ 따뜻한이웃' },
  { value: 'HONORARY', label: '🏅 명예우나어인' },
]
const GRADE_LABEL: Record<string, string> = {
  SPROUT: '🌱', REGULAR: '🌿', WARM_NEIGHBOR: '☀️', HONORARY: '🏅',
}

// 이동 URL 프리셋 — slug는 src/lib/queries/boards.ts slugMap 기준
const URL_PRESETS = [
  { label: '홈', path: '/' },
  { label: '사는이야기', path: '/community/stories' },
  { label: '일자리', path: '/jobs' },
  { label: '매거진', path: '/magazine' },
  { label: '2막준비', path: '/community/life2' },
  { label: '웃음방', path: '/community/humor' },
  { label: '수다방', path: '/community/weekly' },
]

const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary'

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function PushBroadcastForm({ subUsers, consentUsers }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [messageType, setMessageType] = useState<'service' | 'ad'>('service')
  const [targetMode, setTargetMode] = useState<'all' | 'grade' | 'user'>('all')
  const [targetGrade, setTargetGrade] = useState('ALL')

  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [minDt, setMinDt] = useState('')
  const [schedules, setSchedules] = useState<ScheduledPushItem[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PushTargetUser[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, startSearch] = useTransition()
  const [selected, setSelected] = useState<PushTargetUser[]>([])

  const [estimate, setEstimate] = useState<number | null>(null)
  const [result, setResult] = useState<{ error?: string; sent?: number; scheduled?: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAd = messageType === 'ad'
  const selectedIds = selected.map((u) => u.id)

  const refreshSchedules = useCallback(() => { listScheduledPushes().then(setSchedules).catch(() => {}) }, [])

  // 마운트: 예약 목록 로드 + datetime-local 최소값(현재+5분)
  useEffect(() => {
    refreshSchedules()
    const d = new Date(Date.now() + 5 * 60 * 1000)
    d.setSeconds(0, 0)
    setMinDt(toLocalInput(d))
  }, [refreshSchedules])

  // 예상 수신자 수 — 조건 변경 시 디바운스 재계산
  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      const n = await countPushRecipients({ targetMode, targetGrade, targetUserIds: selectedIds, isAd })
      if (active) setEstimate(n)
    }, 300)
    return () => { active = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, targetGrade, messageType, selectedIds.join(',')])

  function doSearch() {
    if (!query.trim()) return
    startSearch(async () => {
      setResults(await searchPushTargets(query))
      setSearched(true)
    })
  }
  function toggle(u: PushTargetUser) {
    setSelected((prev) => prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u])
  }

  const excludedNoSub = selected.filter((u) => !u.hasSubscription)
  const excludedNoConsent = isAd ? selected.filter((u) => u.hasSubscription && !u.marketingOptIn) : []

  // 예약 시각이 야간(21~08 KST)이면 광고는 발송 안 됨(notify가 자동 스킵)
  const schedHour = sendMode === 'schedule' && scheduledLocal ? new Date(scheduledLocal).getHours() : null
  const adNightWarn = isAd && schedHour !== null && (schedHour >= 21 || schedHour < 8)
  const urlHint = url.trim() !== '' && !url.trim().startsWith('/')

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('title', title); fd.set('body', body); fd.set('url', url)
    fd.set('messageType', messageType); fd.set('targetMode', targetMode); fd.set('targetGrade', targetGrade)
    fd.set('targetUserIds', JSON.stringify(selectedIds))
    return fd
  }

  function submit() {
    setResult(null)
    if (!title.trim() || !body.trim()) { setResult({ error: '제목과 내용을 입력해 주세요' }); return }
    const fd = buildFormData()

    if (sendMode === 'schedule') {
      if (!scheduledLocal) { setResult({ error: '예약 시각을 선택해 주세요' }); return }
      fd.set('scheduledAt', new Date(scheduledLocal).toISOString())   // 로컬(KST) → UTC ISO
      startTransition(async () => {
        const r = await schedulePush(fd)
        if (r.error) setResult({ error: r.error })
        else { setResult({ scheduled: true }); setScheduledLocal(''); refreshSchedules() }
      })
    } else {
      startTransition(async () => { setResult(await adminBroadcastPush(fd)) })
    }
  }

  function cancel(id: string) {
    startTransition(async () => { await cancelScheduledPush(id); refreshSchedules() })
  }

  const previewTitle = (isAd ? '(광고) ' : '') + (title.trim() || '제목 미입력')
  const baseValid = !!title.trim() && !!body.trim() && (targetMode !== 'user' || selected.length > 0)
  const canSend = !isPending && (estimate ?? 0) > 0 && baseValid && (sendMode === 'now' || !!scheduledLocal)
  const sendLabel = sendMode === 'schedule'
    ? (isPending ? '예약 중…' : `예약하기 (약 ${(estimate ?? 0).toLocaleString()}명)`)
    : (isPending ? '발송 중…' : `지금 발송 (약 ${(estimate ?? 0).toLocaleString()}명)`)

  function targetLabel(s: ScheduledPushItem): string {
    if (s.targetMode === 'user') return `특정 ${s.targetUserIds.length}명`
    if (s.targetMode === 'grade') return GRADE_OPTIONS.find((g) => g.value === s.targetGrade)?.label ?? s.targetGrade
    return '전체 구독자'
  }
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '예정', cls: 'bg-blue-100 text-blue-700' },
    SENT: { label: '발송됨', cls: 'bg-emerald-100 text-emerald-700' },
    CANCELED: { label: '취소', cls: 'bg-zinc-200 text-zinc-500' },
    FAILED: { label: '실패', cls: 'bg-red-100 text-red-700' },
  }

  function MemberBadges({ u }: { u: PushTargetUser }) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {u.hasSubscription
          ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">구독✓</span>
          : <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">미구독</span>}
        {u.marketingOptIn
          ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">동의✓</span>
          : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">미동의</span>}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* 입력 */}
        <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="title">메시지 제목 <span className="text-zinc-400">(최대 50자)</span></label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} placeholder="예: 새로운 일자리가 올라왔어요!" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="body">메시지 내용 <span className="text-zinc-400">(최대 120자)</span></label>
            <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={120} rows={3} placeholder="예: 우나어에서 나에게 맞는 일자리를 확인해 보세요." className={`${inputCls} resize-none`} />
          </div>

          {/* 이동 URL */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="url">눌렀을 때 이동할 곳 <span className="text-zinc-400">(기본: 홈)</span></label>
            <input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/community/stories" className={inputCls} />
            <p className="text-xs text-zinc-500">전체 주소(https://…)가 아니라 <b>/로 시작하는 사이트 안 경로</b>를 넣어요. 아래 버튼으로 채울 수 있어요.</p>
            <div className="flex flex-wrap gap-1.5">
              {URL_PRESETS.map((p) => (
                <button key={p.path} type="button" onClick={() => setUrl(p.path)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${url.trim() === p.path ? 'border-primary bg-primary/5 text-primary-text' : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400">특정 글로 보내려면 그 글 주소의 <b>/ 이후 경로</b>를 붙여넣어요. 예) <code className="rounded bg-zinc-100 px-1">/community/stories/abcd123</code></p>
            {urlHint && <p className="text-xs text-amber-700">경로는 <b>/</b> 로 시작해요. (예: /magazine)</p>}
          </div>

          {/* 메시지 유형 */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700">메시지 유형</label>
            <select value={messageType} onChange={(e) => setMessageType(e.target.value as 'service' | 'ad')} className={inputCls}>
              <option value="service">서비스 알림 (공지·안내 — 구독자 전원)</option>
              <option value="ad">광고/마케팅 (혜택·이벤트 — 마케팅 동의자만)</option>
            </select>
            {isAd && (
              <p className="text-xs text-amber-700">⚖️ 광고: 마케팅 동의자(<b>{consentUsers.toLocaleString()}명</b>)에게만 발송 + 제목 자동 <b>(광고)</b> + <b>야간 21~08시 차단</b> (정보통신망법 §50)</p>
            )}
          </div>

          {/* 발송 대상 방식 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700">발송 대상</label>
            <div className="flex gap-2">
              {([['all', '전체 구독자'], ['grade', '등급별'], ['user', '특정 회원']] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setTargetMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${targetMode === m ? 'border-primary bg-primary/5 text-primary-text' : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'}`}>
                  {label}
                </button>
              ))}
            </div>

            {targetMode === 'grade' && (
              <select value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} className={inputCls}>
                {GRADE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}

            {targetMode === 'user' && (
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex gap-2">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch() } }}
                    placeholder="닉네임으로 검색" className={inputCls} />
                  <button type="button" onClick={doSearch} disabled={searching} className="shrink-0 rounded-lg bg-zinc-800 px-4 text-sm font-medium text-white disabled:opacity-50">
                    {searching ? '검색…' : '찾기'}
                  </button>
                </div>

                {searched && results.length === 0 && <p className="text-xs text-zinc-500">검색 결과가 없어요.</p>}
                {results.length > 0 && (
                  <ul className="max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
                    {results.map((u) => {
                      const checked = !!selected.find((x) => x.id === u.id)
                      return (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50">
                            <input type="checkbox" checked={checked} onChange={() => toggle(u)} className="h-4 w-4 accent-primary" />
                            <span className="font-medium text-zinc-800">{GRADE_LABEL[u.grade] ?? ''} {u.nickname}</span>
                            <MemberBadges u={u} />
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {selected.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-zinc-600">선택 {selected.length}명</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary-text">
                          {u.nickname}
                          <button type="button" onClick={() => toggle(u)} className="font-bold text-primary-text/70 hover:text-primary-text">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 발송 시점 — 지금 / 예약 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700">발송 시점</label>
            <div className="flex gap-2">
              {([['now', '지금 보내기'], ['schedule', '예약 발송']] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setSendMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${sendMode === m ? 'border-primary bg-primary/5 text-primary-text' : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'}`}>
                  {label}
                </button>
              ))}
            </div>
            {sendMode === 'schedule' && (
              <>
                <input type="datetime-local" value={scheduledLocal} min={minDt} onChange={(e) => setScheduledLocal(e.target.value)} className={inputCls} />
                <p className="text-[11px] text-zinc-400">최소 5분 뒤부터. 발송은 5분 단위로 처리돼요(예: 15:00 예약 → 15:00~15:05 사이).</p>
                {adNightWarn && <p className="text-xs text-amber-700">⚠️ 이 시각은 광고 차단 시간(21~08시)이라 <b>광고는 발송되지 않아요</b>. 서비스 알림으로 바꾸거나 시각을 옮겨 주세요.</p>}
              </>
            )}
          </div>

          {/* 예상 수신자 + 제외 경고 */}
          <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <p className="text-zinc-700">이 조건으로 <b className="text-zinc-900">약 {(estimate ?? 0).toLocaleString()}명</b>에게 발송됩니다.</p>
            {(excludedNoSub.length > 0 || excludedNoConsent.length > 0) && (
              <p className="mt-1 text-xs text-amber-700">
                제외: {excludedNoSub.length > 0 && `미구독 ${excludedNoSub.length}명`}
                {excludedNoSub.length > 0 && excludedNoConsent.length > 0 && ' · '}
                {excludedNoConsent.length > 0 && `광고 미동의 ${excludedNoConsent.length}명`}
              </p>
            )}
          </div>

          {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
          {result?.sent !== undefined && <p className="text-sm font-medium text-green-700">✅ {result.sent.toLocaleString()}명에게 발송 완료</p>}
          {result?.scheduled && <p className="text-sm font-medium text-green-700">✅ 예약이 등록됐어요. 아래 목록에서 확인·취소할 수 있어요.</p>}

          <button type="button" onClick={submit} disabled={!canSend}
            className="h-10 w-full rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 active:opacity-80">
            {sendLabel}
          </button>
          {subUsers === 0 && <p className="text-center text-xs text-zinc-500">아직 구독자가 없어요. 회원들이 토스트에서 &ldquo;받을게요&rdquo;를 누르면 쌓입니다.</p>}
        </div>

        {/* 미리보기 */}
        <div className="lg:sticky lg:top-4 self-start space-y-2">
          <p className="text-xs font-medium text-zinc-500">📱 알림 미리보기</p>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-3">
            <div className="flex items-start gap-2.5 rounded-xl bg-white p-3 shadow-sm">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-zinc-700">우리 나이가 어때서</span>
                  <span className="text-[11px] text-zinc-400">지금</span>
                </div>
                <p className="mt-0.5 break-words text-[13px] font-semibold text-zinc-900">{previewTitle}</p>
                <p className="mt-0.5 break-words text-[12px] leading-snug text-zinc-600">{body.trim() || '내용 미입력'}</p>
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            실제 알림 모양입니다. {isAd && <b className="text-amber-600">광고는 제목에 (광고)가 자동으로 붙어요.</b>}
          </p>
        </div>
      </div>

      {/* 예약 목록 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-800">예약 목록</h2>
        {schedules.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">예약된 발송이 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {schedules.map((s) => {
              const badge = STATUS_BADGE[s.status] ?? { label: s.status, cls: 'bg-zinc-200 text-zinc-600' }
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-800">{s.messageType === 'ad' ? '(광고) ' : ''}{s.title}</p>
                    <p className="text-xs text-zinc-500">
                      {fmtTime(s.scheduledAt)} · {targetLabel(s)}
                      {s.status === 'SENT' && s.sentCount != null ? ` · ${s.sentCount.toLocaleString()}명 발송` : ''}
                      {s.status === 'FAILED' && s.error ? ` · ${s.error}` : ''}
                    </p>
                  </div>
                  {s.status === 'PENDING' && (
                    <button type="button" onClick={() => cancel(s.id)} disabled={isPending}
                      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                      취소
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
