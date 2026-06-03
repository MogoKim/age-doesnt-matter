import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/auth'
import { safeKakaoCallbackUrl } from '@/lib/kakao-start'

export async function GET(request: NextRequest) {
  const callbackUrl = safeKakaoCallbackUrl(request.nextUrl.searchParams.get('callbackUrl') ?? '/')
  await signIn('kakao', { redirectTo: callbackUrl })

  return NextResponse.redirect(new URL('/login', request.url))
}
