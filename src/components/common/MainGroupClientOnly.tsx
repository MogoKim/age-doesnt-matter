'use client'

import dynamic from 'next/dynamic'

/**
 * `(main)` 그룹 레이아웃의 client 전용 컴포넌트 묶음 — Next 16 전환(2026-09-09).
 *
 * Server Component 에서 `ssr: false` 를 못 쓰게 되어 client 경계로 옮겼다.
 * `MainLayout` 앞뒤 렌더 순서를 유지해야 해서 **위/아래 두 조각**으로 나눈다.
 */

const ProgressBar = dynamic(() => import('@/components/common/ProgressBar'), { ssr: false })
const WelcomeToast = dynamic(() => import('@/components/common/WelcomeToast').then(m => ({ default: m.WelcomeToast })), { loading: () => null, ssr: false })
const OfflineBanner = dynamic(() => import('@/components/common/OfflineBanner'), { loading: () => null, ssr: false })
const PopupRenderer = dynamic(() => import('@/components/common/PopupRenderer'), { loading: () => null, ssr: false })
const SoranSoranPopup = dynamic(() => import('@/components/features/bridge/SoranSoranPopup'), { loading: () => null, ssr: false })
const PushPermissionToast = dynamic(() => import('@/components/common/PushPermissionToast').then(m => ({ default: m.PushPermissionToast })), { loading: () => null, ssr: false })

/** MainLayout 위에 렌더되던 것들. */
export function MainGroupClientTop() {
  return (
    <>
      <ProgressBar />
      <WelcomeToast />
      <OfflineBanner />
    </>
  )
}

/** MainLayout 아래에 렌더되던 것들. */
export function MainGroupClientBottom() {
  return (
    <>
      {/* Project BRIDGE(2026-09-22): SignupPromptBanner(정독 85% 후 5초 자동 가입) 마운트 해제.
          우나어 가입 유도와 소란소란 이주 유도가 같은 화면에서 충돌하므로 중단한다.
          컴포넌트 파일은 남겨둔다 — 계약 테스트(r8-telemetry-v2)가 소스를 읽고,
          되돌릴 때 import 1줄 + 렌더 1줄 복구로 끝나게 하기 위함. */}
      <PopupRenderer />
      {/* Project BRIDGE: 소란소란 안내 모달. ssr:false 필수 — 크롤러 노출 시 doorway 판정 위험. */}
      <SoranSoranPopup />
      <PushPermissionToast />
    </>
  )
}
