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
const SignupPromptBanner = dynamic(() => import('@/components/common/SignupPromptBanner').then(m => ({ default: m.SignupPromptBanner })), { loading: () => null, ssr: false })
const PopupRenderer = dynamic(() => import('@/components/common/PopupRenderer'), { loading: () => null, ssr: false })
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
      <SignupPromptBanner />
      <PopupRenderer />
      <PushPermissionToast />
    </>
  )
}
