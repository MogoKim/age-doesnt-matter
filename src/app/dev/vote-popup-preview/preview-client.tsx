'use client'

import { useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { VotePopupView } from '@/components/features/vote/VotePopup'
import type { VoteStatus } from '@/components/features/vote/VoteWidget'

type PreviewState = '미투표' | '투표 완료' | '실패' | 'CLOSED'

const STATES: PreviewState[] = ['미투표', '투표 완료', '실패', 'CLOSED']

const MOCK_VOTE: VoteStatus = {
  id: 'preview',
  question: '우리 집 남편은 어느 쪽인가요?',
  optionA: '잔소리형',
  optionB: '무뚝뚝형',
  status: 'OPEN',
  linkedPostId: null,
  linkedPostUrl: null,
  displayA: 77,
  displayB: 54,
  total: 131,
  displayViews: 412,
  myChoice: null,
}

/** 상태 강제 렌더 — 실제 API 호출 없음, 순수 디자인 검토용 */
export default function VotePopupPreviewClient() {
  const [state, setState] = useState<PreviewState>('미투표')
  const [open, setOpen] = useState(true)

  const vote: VoteStatus = {
    ...MOCK_VOTE,
    myChoice: state === '투표 완료' ? 'A' : state === 'CLOSED' ? 'B' : null,
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 가짜 홈 콘텐츠 — dim 뒤로 홈이 얼마나 보이는지 확인용 */}
      <div className="p-4 space-y-3">
        <div className="h-[150px] rounded-2xl bg-gradient-to-br from-primary to-[#FF9E8C]" />
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-6 w-32 rounded bg-muted" />
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-20 rounded-xl bg-muted/70" />
      </div>

      {/* 상태 전환 컨트롤 — 시트 위에 떠 있게 상단 고정 */}
      <div className="fixed top-2 left-2 right-2 z-[60] flex gap-1.5 rounded-xl bg-black/70 p-2">
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setState(s)
              setOpen(true)
            }}
            className={`flex-1 rounded-lg px-1 py-2 text-[13px] font-bold ${
              s === state ? 'bg-white text-black' : 'bg-white/15 text-white'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary px-2 py-2 text-[13px] font-bold text-white"
        >
          열기
        </button>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <VotePopupView
          vote={vote}
          phase={state === '투표 완료' ? 'done' : 'vote'}
          failed={state === '실패'}
          closed={state === 'CLOSED'}
          onCast={() => setState('투표 완료')}
          onGoToPost={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      </BottomSheet>

      {state === 'CLOSED' && (
        <p className="fixed bottom-2 left-2 right-2 z-[60] rounded-lg bg-black/70 p-2 text-center text-[12px] text-white">
          참고: 실제 홈에서는 CLOSED면 팝업 자체가 뜨지 않음 — 이 화면은 디자인 검토용
        </p>
      )}
    </div>
  )
}
