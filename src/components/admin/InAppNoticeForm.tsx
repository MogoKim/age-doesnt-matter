'use client'

import { useRef, useState, useTransition } from 'react'
import { broadcastInAppNotice, sendNoticeTest } from '@/app/admin/(panel)/push/notice-actions'

export default function InAppNoticeForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [result, setResult] = useState<{ error?: string; bellSent?: number; pushSent?: number } | null>(null)
  const [testResult, setTestResult] = useState<{ error?: string; ok?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [testPending, startTestTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    if (!window.confirm('전체 실고객 전원에게 종 알림을 발송합니다. 되돌릴 수 없어요. 발송할까요?')) return
    startTransition(async () => {
      const res = await broadcastInAppNotice(formData)
      setResult(res)
      if (res.bellSent) form.reset()
    })
  }

  function handleTest() {
    setTestResult(null)
    if (!formRef.current) return
    const formData = new FormData(formRef.current)
    startTestTransition(async () => {
      setTestResult(await sendNoticeTest(formData))
    })
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6">
      <h2 className="text-lg font-bold text-zinc-900">📢 전체 공지 (인앱 종 알림)</h2>
      <p className="mt-1 text-sm text-zinc-600">
        <b className="text-indigo-700">구독·마케팅 동의와 무관하게 전체 실고객 전원</b>에게 앱 안 종(🔔) 알림을 보냅니다.
        그중 푸시 구독자에게는 OS 푸시도 함께 갑니다. <b className="text-red-600">공지·안내 등 서비스성 내용만</b> (광고·혜택 문구 금지).
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="notice-title">
            제목 <span className="text-zinc-400">(푸시 알림용 · 종 알림엔 내용만 표시)</span>
          </label>
          <input
            id="notice-title"
            name="title"
            type="text"
            maxLength={50}
            placeholder="예: 우나어 공지"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="notice-body">
            공지 내용 <span className="text-zinc-400">(최대 200자, 필수)</span>
          </label>
          <textarea
            id="notice-body"
            name="body"
            maxLength={200}
            required
            rows={3}
            placeholder="예: 안녕하세요, 우나어입니다. 이용 안내 말씀드려요 …"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="notice-url">
            이동 경로 <span className="text-zinc-400">(푸시 클릭 시 이동 · 기본 홈)</span>
          </label>
          <input
            id="notice-url"
            name="url"
            type="text"
            placeholder="/  또는  /community/stories/글ID"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* 테스트(나에게만) — 전원 발송 전 본인 폰으로 확인 */}
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-3">
          <p className="text-xs font-medium text-zinc-600">🧪 먼저 나에게만 테스트 (위 내용으로 1명에게만 발송)</p>
          <p className="mt-0.5 text-xs text-zinc-400">어드민 계정 ≠ 회원 계정이라, 본인이 가입한 <b>회원 닉네임</b>을 넣으세요. 그 계정으로 종+푸시가 갑니다.</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              name="testNickname"
              placeholder="본인 회원 닉네임"
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={testPending}
              className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {testPending ? '발송 중…' : '🧪 테스트 발송'}
            </button>
          </div>
          {testResult?.error && <p className="mt-2 text-xs text-red-600">{testResult.error}</p>}
          {testResult?.ok && <p className="mt-2 text-xs font-medium text-green-700">✅ {testResult.ok}</p>}
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4" />
          <span>전체 실고객 전원에게 발송하는 것을 확인합니다 (되돌릴 수 없음).</span>
        </label>

        {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
        {result?.bellSent !== undefined && (
          <p className="text-sm font-medium text-green-700">
            ✅ 종 알림 {result.bellSent.toLocaleString()}명 발송 · OS 푸시 {result.pushSent?.toLocaleString() ?? 0}명 발송 완료
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="h-11 w-full rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 active:opacity-80"
        >
          {isPending ? '발송 중…' : '📢 전체 공지 발송'}
        </button>
      </form>
    </div>
  )
}
