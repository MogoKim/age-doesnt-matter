import 'server-only'
import dynamic from 'next/dynamic'
import { getAuth } from '@/lib/auth-rsc'

const SignupPromptBanner = dynamic(
  () => import('@/components/common/SignupPromptBanner').then(m => ({ default: m.SignupPromptBanner })),
  { loading: () => null, ssr: false },
)

export default async function AuthBanners() {
  const session = await getAuth()
  return (
    <SignupPromptBanner
      isLoggedIn={!!session?.user}
      createdAt={session?.user?.createdAt}
    />
  )
}
