'use client'

import { useState } from 'react'
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

/**
 * 팝업 디자인 검토 하네스 — 데스크탑 브라우저에서도 devtools 없이 바로 폰(375×812)처럼 보이게
 * 자체 폰 프레임 + 자체 바텀시트로 렌더한다 (공용 BottomSheet는 실제 홈에서만 사용, 여기선 미사용).
 */
export default function VotePopupPreviewClient() {
  const [state, setState] = useState<PreviewState>('미투표')
  const [open, setOpen] = useState(true)

  const vote: VoteStatus = {
    ...MOCK_VOTE,
    myChoice: state === '투표 완료' ? 'A' : state === 'CLOSED' ? 'B' : null,
  }
  const sheetHeightPct =
    state === '미투표' ? '42%' : state === 'CLOSED' ? '48%' : '52%'

  return (
    <div className="min-h-screen bg-neutral-200 flex flex-col items-center gap-4 py-6">
      {/* 상태 전환 컨트롤 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setState(s)
              setOpen(true)
            }}
            className={`rounded-lg px-4 py-2.5 text-[15px] font-bold ${
              s === state ? 'bg-black text-white' : 'bg-white text-neutral-700 border border-neutral-300'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white"
        >
          {open ? '시트 닫기' : '시트 열기'}
        </button>
      </div>
      <p className="text-[13px] text-neutral-500">
        375×812 폰 프레임 · 현재 시트 높이 화면의 {sheetHeightPct}
      </p>

      {/* 폰 프레임 375×812 — 데스크탑에서도 폰처럼 보임 */}
      <div
        className="relative overflow-hidden rounded-[36px] border-[10px] border-black bg-white shadow-2xl"
        style={{ width: 375, height: 812 }}
      >
        {/* 가짜 홈 배경 — dim 뒤로 얼마나 보이는지 확인용 */}
        <div className="absolute inset-0 overflow-hidden p-4 space-y-3">
          <div className="h-[150px] rounded-2xl bg-gradient-to-br from-primary to-[#FF9E8C]" />
          <div className="h-6 w-40 rounded bg-neutral-200" />
          <div className="h-24 rounded-xl bg-neutral-100" />
          <div className="h-24 rounded-xl bg-neutral-100" />
          <div className="h-6 w-32 rounded bg-neutral-200" />
          <div className="h-24 rounded-xl bg-neutral-100" />
        </div>

        {/* dim + 자체 바텀시트 (프레임 내부만 덮음) */}
        {open && (
          <>
            <button
              aria-label="닫기"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/45 border-none"
            />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-6 pt-3 pb-7 overflow-y-auto"
              style={{ maxHeight: sheetHeightPct }}
            >
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-neutral-300" />
              <VotePopupView
                vote={vote}
                phase={state === '투표 완료' ? 'done' : 'vote'}
                failed={state === '실패'}
                closed={state === 'CLOSED'}
                onCast={() => setState('투표 완료')}
                onGoToPost={() => setOpen(false)}
                onClose={() => setOpen(false)}
              />
            </div>
          </>
        )}
      </div>

      {state === 'CLOSED' && (
        <p className="text-[12px] text-neutral-500">
          참고: 실제 홈에서는 CLOSED면 팝업 자체가 안 뜸 — 이 화면은 디자인 검토용
        </p>
      )}
    </div>
  )
}
