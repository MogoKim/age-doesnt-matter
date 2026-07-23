'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { submitSurveyResponse } from '@/lib/actions/survey'
import type { SurveyQuestion, SurveyAnswers, SurveyAnswerValue } from '@/lib/events/survey'

export interface SurveyDetailData {
  eventId: string
  title: string
  description: string | null
  questions: SurveyQuestion[]
  consentText: string
}

/**
 * 페이지 래퍼(카드 셸). **반드시 모듈 최상위에 정의**한다.
 * ⚠️ SurveyDetail 함수 본문 안에 정의하면 매 렌더마다 새 컴포넌트 타입이 되어
 *    입력 시 서브트리가 unmount/remount → textarea 포커스 상실("한 글자만 입력됨" 버그).
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[640px] mx-auto px-4 py-6 md:px-6 md:py-8 bg-[var(--surface-warm)] min-h-screen">
      <div className="rounded-2xl bg-card border border-border shadow-sm p-4 md:p-5">{children}</div>
      <p className="mt-6 text-center text-caption text-muted-foreground">남겨주신 응답은 운영자만 확인하며 서비스 개선에 소중히 반영됩니다.</p>
    </div>
  )
}

/**
 * 공식 참여 이벤트 상세 — **1분 의견함(SURVEY)** (Phase 5).
 * 구글폼 유사 비공개 설문. 응답은 공개되지 않음(운영자만). 팝업/HERO/링크에서 진입하는 히든 목적지.
 * VoteWidget/댓글/의견 목록 없음. 제출 후 "의견 고맙습니다".
 */
export default function SurveyDetail({
  data,
  closed,
  alreadyResponded,
  source,
}: {
  data: SurveyDetailData
  closed: boolean
  alreadyResponded: boolean
  source?: string
}) {
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [already, setAlready] = useState(alreadyResponded)

  const set = (id: string, v: SurveyAnswerValue) => setAnswers((a) => ({ ...a, [id]: v }))
  const toggleMulti = (id: string, opt: string) =>
    setAnswers((a) => {
      const cur = (Array.isArray(a[id]) ? a[id] : []) as string[]
      return { ...a, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const src = source === 'popup' || source === 'hero' || source === 'push' ? source : 'direct'
      const result = await submitSurveyResponse({ eventId: data.eventId, answers, source: src, path: `/events/${data.eventId}` })
      if ('ok' in result) { setDone(true); return }
      if (result.alreadyResponded) { setAlready(true); return }
      setError(result.error)
    })
  }

  const Header = (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] overflow-hidden shrink-0">
        <Image src="/logo-symbol.png" alt="우리 나이가 어때서" width={28} height={28} className="object-contain" />
      </span>
      <span className="text-caption font-bold text-foreground">우리 나이가 어때서</span>
      <span className="text-caption font-bold text-[#4F46E5] bg-[#EEF2FF] rounded-full px-2.5 py-1 leading-none">📝 1분 의견함</span>
    </div>
  )

  if (closed) return <Shell>{Header}<h1 className="text-heading font-bold text-foreground m-0">{data.title}</h1><p className="mt-4 text-body text-muted-foreground">마감된 의견함입니다. 참여해 주셔서 고맙습니다 🙏</p></Shell>
  if (done) return <Shell>{Header}<h1 className="text-heading font-bold text-foreground m-0">의견 고맙습니다 · 소중히 반영할게요</h1><p className="mt-3 text-body text-muted-foreground">남겨주신 1분이 우나어를 더 좋게 만듭니다.</p></Shell>
  if (already) return <Shell>{Header}<h1 className="text-heading font-bold text-foreground m-0">{data.title}</h1><p className="mt-4 text-body text-muted-foreground">이미 의견을 남겨주셨어요. 고맙습니다! (한 번만 참여할 수 있어요)</p></Shell>

  return (
    <Shell>
      {Header}
      <h1 className="text-heading font-bold text-foreground m-0 leading-[1.35] break-keep">{data.title}</h1>
      {data.description && <p className="text-body text-muted-foreground m-0 mt-2 break-keep">{data.description}</p>}
      <p className="mt-1 text-caption font-semibold text-[#4F46E5]">⏱ 예상 소요 1분</p>

      <div className="mt-5 space-y-6">
        {data.questions.filter((q) => q.type !== 'consent').map((q) => (
          <div key={q.id}>
            <p className="text-title font-bold text-foreground m-0 mb-2.5 break-keep">
              {q.label}{q.required && <span className="text-primary"> *</span>}
            </p>
            {q.type === 'single_choice' && (
              <div className="flex flex-col gap-2">
                {(q.options ?? []).map((o) => (
                  <button key={o} type="button" onClick={() => set(q.id, o)}
                    className={`text-left w-full min-h-[52px] px-4 rounded-xl border text-body transition-colors ${answers[q.id] === o ? 'border-primary bg-primary/10 text-primary-text font-bold' : 'border-border bg-background text-foreground'}`}>
                    {o}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'multiple_choice' && (
              <div className="flex flex-col gap-2">
                {(q.options ?? []).map((o) => {
                  const on = ((answers[q.id] as string[]) ?? []).includes(o)
                  return (
                    <button key={o} type="button" onClick={() => toggleMulti(q.id, o)}
                      className={`text-left w-full min-h-[52px] px-4 rounded-xl border text-body transition-colors ${on ? 'border-primary bg-primary/10 text-primary-text font-bold' : 'border-border bg-background text-foreground'}`}>
                      {on ? '☑' : '☐'} {o}
                    </button>
                  )
                })}
              </div>
            )}
            {q.type === 'rating_1_5' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => set(q.id, n)}
                    className={`flex-1 min-h-[52px] rounded-xl border text-title font-bold transition-colors ${answers[q.id] === n ? 'border-primary bg-primary text-white' : 'border-border bg-background text-foreground'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'scale_0_10' && (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button key={n} type="button" onClick={() => set(q.id, n)}
                      className={`min-h-[48px] min-w-[44px] flex-1 rounded-lg border text-body font-bold transition-colors ${answers[q.id] === n ? 'border-primary bg-primary text-white' : 'border-border bg-background text-foreground'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-caption text-muted-foreground"><span>전혀 아니다 (0)</span><span>매우 그렇다 (10)</span></div>
              </div>
            )}
            {q.type === 'short_text' && (
              <input type="text" maxLength={200} value={(answers[q.id] as string) ?? ''} onChange={(e) => set(q.id, e.target.value)}
                className="w-full min-h-[52px] px-3 rounded-xl border border-border bg-background text-body text-foreground outline-none focus:border-primary" placeholder="짧게 적어주세요" />
            )}
            {q.type === 'long_text' && (
              <textarea maxLength={1000} rows={4} value={(answers[q.id] as string) ?? ''} onChange={(e) => set(q.id, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-body text-foreground outline-none focus:border-primary resize-none" placeholder="자유롭게 적어주세요 (개인정보·민감한 내용은 적지 말아 주세요)" />
            )}
          </div>
        ))}

        {/* 개인정보/서비스 개선 동의 (consent 문항) */}
        {data.questions.filter((q) => q.type === 'consent').map((q) => (
          <label key={q.id} className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={answers[q.id] === true} onChange={(e) => set(q.id, e.target.checked)} />
            <span className="text-caption leading-[1.6] text-foreground">
              {q.label}{q.required && <span className="text-primary"> *</span>}
              <span className="block mt-1 text-caption text-muted-foreground">{data.consentText}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-caption font-semibold text-red-600">{error}</p>}

      <button type="button" onClick={submit} disabled={pending}
        className="mt-6 w-full min-h-[56px] rounded-2xl bg-primary text-title font-bold text-white shadow-sm disabled:opacity-60">
        {pending ? '제출 중…' : '의견 제출하기'}
      </button>
    </Shell>
  )
}
