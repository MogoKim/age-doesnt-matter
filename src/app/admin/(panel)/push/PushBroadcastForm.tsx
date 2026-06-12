'use client'

import { useState, useTransition } from 'react'
import { adminBroadcastPush } from './actions'

interface Props {
  subCount: number
}

const GRADE_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'SPROUT', label: '🌱 새싹' },
  { value: 'REGULAR', label: '🌿 단골' },
  { value: 'WARM_NEIGHBOR', label: '☀️ 따뜻한이웃' },
  { value: 'HONORARY', label: '🏅 명예우나어인' },
]

export default function PushBroadcastForm({ subCount }: Props) {
  const [result, setResult] = useState<{ error?: string; sent?: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = await adminBroadcastPush(formData)
      setResult(res)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="title">
          메시지 제목 <span className="text-zinc-400">(최대 50자)</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          maxLength={50}
          required
          placeholder="예: 새로운 일자리가 올라왔어요!"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="body">
          메시지 내용 <span className="text-zinc-400">(최대 120자)</span>
        </label>
        <textarea
          id="body"
          name="body"
          maxLength={120}
          required
          rows={3}
          placeholder="예: 우나어에서 나에게 맞는 일자리를 확인해 보세요."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="url">
          이동 URL <span className="text-zinc-400">(기본: /)</span>
        </label>
        <input
          id="url"
          name="url"
          type="text"
          placeholder="/community/jobs"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="messageType">
          메시지 유형
        </label>
        <select
          id="messageType"
          name="messageType"
          defaultValue="service"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="service">서비스 알림 (공지·안내 — 구독자 전원)</option>
          <option value="ad">광고/마케팅 (혜택·이벤트 — 마케팅 동의자만)</option>
        </select>
        <p className="text-xs text-zinc-500">
          ⚖️ 광고 선택 시: 마케팅 동의자에게만 발송 + 제목 자동 <b>(광고)</b> 표기 + <b>야간 21~08시 차단</b> (정보통신망법 §50)
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="targetGrade">
          발송 대상
        </label>
        <select
          id="targetGrade"
          name="targetGrade"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          {GRADE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {result?.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}
      {result?.sent !== undefined && (
        <p className="text-sm text-green-700 font-medium">
          ✅ {result.sent.toLocaleString()}명에게 발송 완료
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || subCount === 0}
        className="h-10 w-full rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 active:opacity-80"
      >
        {isPending ? '발송 중...' : `발송하기 (구독자 ${subCount.toLocaleString()}명)`}
      </button>
    </form>
  )
}
