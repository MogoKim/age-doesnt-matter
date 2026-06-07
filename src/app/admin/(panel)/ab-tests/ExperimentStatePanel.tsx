'use client'

import { useState, useTransition } from 'react'
import { adminSaveExperimentState } from '@/lib/actions/admin'

const STATUSES = [
  { v: 'DRAFT', l: '기획 중' },
  { v: 'ACTIVE', l: '진행 중' },
  { v: 'PAUSED', l: '일시정지' },
  { v: 'CONCLUDED', l: '종료' },
]

export default function ExperimentStatePanel({
  experimentId,
  status,
  owner,
  note,
  conclusion,
}: {
  experimentId: string
  status: string
  owner: string
  note: string | null
  conclusion: string | null
}) {
  const [s, setS] = useState(status)
  const [o, setO] = useState(owner)
  const [n, setN] = useState(note ?? '')
  const [c, setC] = useState(conclusion ?? '')
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const save = () => {
    setError('')
    start(async () => {
      try {
        await adminSaveExperimentState(experimentId, { status: s, owner: o, note: n, conclusion: c })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        setError('저장 실패 — DB 마이그레이션이 적용됐는지 확인하세요.')
      }
    })
  }

  return (
    <details className="mt-3 border-t border-zinc-100 pt-3">
      <summary className="cursor-pointer text-sm font-medium text-zinc-600">⚙️ 운영 (상태·담당·메모·결론 편집)</summary>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={s}
            onChange={(e) => setS(e.target.value)}
            className="min-h-[40px] rounded-lg border border-zinc-200 px-2 text-sm"
          >
            {STATUSES.map((st) => (
              <option key={st.v} value={st.v}>
                {st.l}
              </option>
            ))}
          </select>
          <input
            value={o}
            onChange={(e) => setO(e.target.value)}
            placeholder="담당"
            className="min-h-[40px] w-28 rounded-lg border border-zinc-200 px-2 text-sm"
          />
        </div>
        <textarea
          value={n}
          onChange={(e) => setN(e.target.value)}
          placeholder="진행 중 관찰 메모"
          rows={2}
          className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
        />
        <textarea
          value={c}
          onChange={(e) => setC(e.target.value)}
          placeholder="결론 (종료 시 — 무엇을 적용했나)"
          rows={2}
          className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={pending}
            className="min-h-[40px] rounded-lg bg-[#FF6F61] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? '저장 중…' : '저장'}
          </button>
          {saved && <span className="text-sm text-green-600">✓ 저장됨</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </details>
  )
}
