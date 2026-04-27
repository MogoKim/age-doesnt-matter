'use client'

import { signIn } from 'next-auth/react'
import { sendGtmEvent, getStoredUtm } from '@/lib/gtm'

interface Props {
  callbackUrl?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  gtmFrom?: string
}

/**
 * 카카오 OAuth 직행 버튼 — /login 페이지를 거치지 않고 바로 카카오로 이동
 * callbackUrl: 로그인 후 돌아올 경로 (기본값 '/')
 */
export default function KakaoSignupButton({ callbackUrl = '/', className, style, children, gtmFrom }: Props) {
  async function handleClick() {
    if (gtmFrom) {
      sendGtmEvent('kakao_button_click', { from: gtmFrom, ...getStoredUtm() })
    }
    await signIn('kakao', { callbackUrl })
  }

  return (
    <button type="button" onClick={handleClick} className={className} style={style}>
      {children}
    </button>
  )
}
