'use client'

import { buildPlayStoreUrl } from '@/lib/app-links'
import { gtmPlayStoreClick } from '@/lib/gtm'

// 홈 FAQ "앱을 설치해야 하나요?" 답변 전용 — 폰별 안내.
//
// [정책 2026-08-06] 아이폰은 앱/PWA 설치를 유도하지 않는다.
//  - iOS는 원클릭 설치가 불가해 "홈 화면에 추가" 3단계를 손으로 따라 해야 했고,
//    그 흐름을 받쳐 주던 PWA 팝업(AddToHomeScreen)은 NEXT_PUBLIC_PWA_INSTALL_ENABLED로 꺼져 있다.
//    안내만 남으면 "따라 했는데 아무 일도 안 일어난다"가 되기 쉬워 안내 자체를 걷어낸다.
//  - 아이폰 사용자에게 필요한 건 설치가 아니라 **가입**이다. 가입해야 댓글·공감으로 다시 오게 된다
//    (North Star = 주간 재방문 참여 유저 수). 가입 유도는 홈 SignupCard·글 상세 PostCTA가 이미 담당하므로
//    여기서는 별도 CTA를 새로 만들지 않고 "설치할 필요 없다"만 짧게 알린다.
//  - 안드로이드 Play스토어 안내는 그대로 유지한다(TWA 앱이 실제로 있다).

export default function AppInstallFaqAnswer() {
  return (
    <div className="flex flex-col gap-3">
      {/* 안드로이드(삼성 등) → Google Play */}
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

      {/* 아이폰 → 설치 유도 없음. 지금 쓰는 그대로 괜찮다는 안내만. */}
      <div className="rounded-xl border border-border bg-muted px-5 py-3">
        <p className="text-body font-bold text-foreground">아이폰이세요?</p>
        <p className="mt-0.5 break-keep text-caption text-muted-foreground">
          따로 설치하지 않으셔도 돼요. 지금 보시는 사파리 화면 그대로 모든 기능을 쓰실 수 있어요.
        </p>
      </div>
    </div>
  )
}
