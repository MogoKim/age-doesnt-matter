'use client'

import { useState } from 'react'
import { buildPlayStoreUrl } from '@/lib/app-links'
import { gtmPlayStoreClick } from '@/lib/gtm'

// 홈 FAQ "앱을 설치해야 하나요?" 답변 전용 — 폰별 CTA.
//  - 삼성폰(안드로이드): Google Play 우나어 앱 페이지로 이동
//  - 아이폰: iOS는 원클릭 설치 불가 → "홈 화면에 추가" 3단계 안내를 인라인으로 펼침
//    (PWA 팝업 흐름 NEXT_PUBLIC_PWA_INSTALL_ENABLED와 무관하게 자체 동작)

const IOS_STEPS = [
  { n: '1', text: '화면 아래 공유 버튼을 눌러요' },
  { n: '2', text: '“홈 화면에 추가”를 선택해요' },
  { n: '3', text: '오른쪽 위 “추가”를 누르면 끝이에요' },
] as const

export default function AppInstallFaqAnswer() {
  const [iosOpen, setIosOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {/* 삼성폰(안드로이드) → Google Play */}
      <a
        href={buildPlayStoreUrl('home_faq_android')}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => gtmPlayStoreClick('home_faq_android')}
        className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 no-underline transition-colors hover:border-primary/40"
      >
        <span className="flex flex-col text-left leading-tight">
          <span className="text-body font-bold text-foreground">삼성/안드로이드폰이세요?</span>
          <span className="text-caption text-muted-foreground">구글 플레이스토어에서 받기</span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#1f2430] px-3 py-2 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.41 12l2.488-2.49zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
          </svg>
          <span className="text-caption font-bold">받기</span>
        </span>
      </a>

      {/* 아이폰 → 홈 화면에 추가 3단계 (토글) */}
      <button
        type="button"
        onClick={() => setIosOpen((v) => !v)}
        aria-expanded={iosOpen}
        className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 text-left transition-colors hover:border-primary/40"
      >
        <span className="flex flex-col leading-tight">
          <span className="text-body font-bold text-foreground">아이폰이세요?</span>
          <span className="text-caption text-muted-foreground">홈 화면에 추가하면 앱처럼 써요</span>
        </span>
        <span
          className="shrink-0 text-xl text-muted-foreground transition-transform duration-200"
          style={{ transform: iosOpen ? 'rotate(180deg)' : undefined }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {iosOpen && (
        <ol className="flex flex-col gap-2.5 rounded-xl bg-muted px-5 py-4">
          {IOS_STEPS.map((s) => (
            <li key={s.n} className="flex items-center gap-3 text-body text-foreground">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-caption font-bold text-primary-text">
                {s.n}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
