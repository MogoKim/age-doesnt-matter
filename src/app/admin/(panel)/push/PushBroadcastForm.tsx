'use client'

import { useState, useTransition, useEffect } from 'react'
import { adminBroadcastPush, searchPushTargets, countPushRecipients, type PushTargetUser } from './actions'

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

const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary'

export default function PushBroadcastForm({ subUsers, consentUsers }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [messageType, setMessageType] = useState<'service' | 'ad'>('service')
  const [targetMode, setTargetMode] = useState<'all' | 'grade' | 'user'>('all')
  const [targetGrade, setTargetGrade] = useState('ALL')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PushTargetUser[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, startSearch] = useTransition()
  const [selected, setSelected] = useState<PushTargetUser[]>([])

  const [estimate, setEstimate] = useState<number | null>(null)
  const [result, setResult] = useState<{ error?: string; sent?: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAd = messageType === 'ad'
  const selectedIds = selected.map((u) => u.id)

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

  // 선택 회원 중 제외 계산
  const excludedNoSub = selected.filter((u) => !u.hasSubscription)
  const excludedNoConsent = isAd ? selected.filter((u) => u.hasSubscription && !u.marketingOptIn) : []

  function submit() {
    setResult(null)
    if (!title.trim() || !body.trim()) { setResult({ error: '제목과 내용을 입력해 주세요' }); return }
    const fd = new FormData()
    fd.set('title', title); fd.set('body', body); fd.set('url', url)
    fd.set('messageType', messageType); fd.set('targetMode', targetMode); fd.set('targetGrade', targetGrade)
    fd.set('targetUserIds', JSON.stringify(selectedIds))
    startTransition(async () => { setResult(await adminBroadcastPush(fd)) })
  }

  const previewTitle = (isAd ? '(광고) ' : '') + (title.trim() || '제목 미입력')
  const canSend = !isPending && (estimate ?? 0) > 0 && !!title.trim() && !!body.trim() &&
    (targetMode !== 'user' || selected.length > 0)

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
        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="url">이동 URL <span className="text-zinc-400">(기본: /)</span></label>
          <input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/community/jobs" className={inputCls} />
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

        <button type="button" onClick={submit} disabled={!canSend}
          className="h-10 w-full rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 active:opacity-80">
          {isPending ? '발송 중…' : `발송하기 (약 ${(estimate ?? 0).toLocaleString()}명)`}
        </button>
        {subUsers === 0 && <p className="text-center text-xs text-zinc-500">아직 구독자가 없어요. 회원들이 토스트에서 "받을게요"를 누르면 쌓입니다.</p>}
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
  )
}
