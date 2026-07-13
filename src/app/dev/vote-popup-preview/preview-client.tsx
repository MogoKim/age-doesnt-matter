'use client'

import { useState } from 'react'
import { VotePopupView } from '@/components/features/vote/VotePopup'
import { VoteHeroSlideView } from '@/components/features/vote/VoteHeroSlide'

const MOCK = { question: '우리 집 남편은 어느 쪽인가요?', optionA: '잔소리형', optionB: '무뚝뚝형' }

/**
 * 투표 입구(팝업/HERO) 디자인 검토 하네스 — 로컬 전용.
 * 팝업·HERO는 결과를 보여주지 않고 선택 즉시 게시글로 이동하는 "입구"다.
 * 실제 이동 대신 상단에 이동 안내를 표시해 동작을 확인한다.
 */
export default function VotePopupPreviewClient() {
  const [tab, setTab] = useState<'팝업' | 'HERO'>('팝업')
  const [heroStatus, setHeroStatus] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<'A' | 'B' | null>(null)
  const [nav, setNav] = useState<string>('')

  const simulateCast = (c: 'A' | 'B') => {
    setActive(c)
    setNav(`선택 "${c === 'A' ? MOCK.optionA : MOCK.optionB}" → POST 후 게시글 상세로 이동 (결과는 게시글에서)`)
    // preview에선 실제 이동이 없으므로 잠깐 피드백만 보여주고 리셋
    setTimeout(() => setActive(null), 400)
  }

  return (
    <div className="min-h-screen bg-neutral-200 flex flex-col items-center gap-3 py-6">
      {/* 탭 */}
      <div className="flex gap-2">
        {(['팝업', 'HERO'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              setNav('')
              setActive(null)
            }}
            className={`rounded-lg px-5 py-2.5 text-[15px] font-bold ${
              t === tab ? 'bg-black text-white' : 'bg-white text-neutral-700 border border-neutral-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 하위 상태 토글 */}
      <div className="flex gap-2">
        {tab === '팝업' ? (
          <>
            <StateChip label="정상" on={!failed} onClick={() => setFailed(false)} />
            <StateChip label="POST 실패" on={failed} onClick={() => setFailed(true)} />
          </>
        ) : (
          <>
            <StateChip label="OPEN(입구)" on={heroStatus === 'OPEN'} onClick={() => setHeroStatus('OPEN')} />
            <StateChip label="CLOSED(결과 teaser)" on={heroStatus === 'CLOSED'} onClick={() => setHeroStatus('CLOSED')} />
          </>
        )}
      </div>

      {/* 이동 안내 (실제 이동 대신) */}
      <p className="h-5 text-[13px] font-semibold text-primary-text">{nav}</p>

      {/* 폰 프레임 375×812 */}
      <div
        className="relative overflow-hidden rounded-[36px] border-[10px] border-black bg-white shadow-2xl"
        style={{ width: 375, height: 812 }}
      >
        {tab === 'HERO' ? (
          <div className="absolute inset-0">
            {/* HERO 영역 — 실제 HeroSliderClient와 동일(aspect 5:2 + minHeight 200) */}
            <div className="relative w-full [aspect-ratio:5/2]" style={{ minHeight: 200 }}>
              <VoteHeroSlideView
                question={MOCK.question}
                optionA={MOCK.optionA}
                optionB={MOCK.optionB}
                status={heroStatus}
                postUrl="#"
                activeChoice={active}
                onCast={simulateCast}
              />
            </div>
            {/* 가짜 홈 콘텐츠 */}
            <div className="p-4 space-y-3">
              <div className="h-6 w-40 rounded bg-neutral-200" />
              <div className="h-24 rounded-xl bg-neutral-100" />
              <div className="h-24 rounded-xl bg-neutral-100" />
              <div className="h-6 w-32 rounded bg-neutral-200" />
              <div className="h-24 rounded-xl bg-neutral-100" />
            </div>
          </div>
        ) : (
          <>
            {/* 가짜 홈 배경 */}
            <div className="absolute inset-0 overflow-hidden p-4 space-y-3">
              <div className="h-[150px] rounded-2xl bg-gradient-to-br from-primary to-[#FF9E8C]" />
              <div className="h-6 w-40 rounded bg-neutral-200" />
              <div className="h-24 rounded-xl bg-neutral-100" />
              <div className="h-24 rounded-xl bg-neutral-100" />
              <div className="h-6 w-32 rounded bg-neutral-200" />
            </div>
            {/* dim + 시트 (compact, 화면 42%) */}
            <div className="absolute inset-0 bg-black/45" />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-6 pt-3 pb-7 overflow-y-auto"
              style={{ maxHeight: '42%' }}
            >
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-neutral-300" />
              <VotePopupView
                vote={MOCK}
                failed={failed}
                activeChoice={active}
                onCast={simulateCast}
                onClose={() => setNav('닫기 — 오늘 재노출 없음')}
                onGoToPost={() => setNav('실패 폴백 → 게시글에서 투표하기')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StateChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[13px] font-bold ${
        on ? 'bg-black text-white' : 'bg-white text-neutral-600 border border-neutral-300'
      }`}
    >
      {label}
    </button>
  )
}
