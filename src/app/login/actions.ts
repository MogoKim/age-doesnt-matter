'use server'

import { signIn } from '@/lib/auth'

export async function kakaoSignIn(callbackUrl: string) {
  await signIn('kakao', { redirectTo: callbackUrl })
}
