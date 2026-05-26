import 'server-only'
import dynamic from 'next/dynamic'
import { auth } from '@/lib/auth'

const SignupPromptBanner = dynamic(
  () => import('@/components/common/SignupPromptBanner').then(m => ({ default: m.SignupPromptBanner })),
  { loading: () => null, ssr: false },
)

export default async function AuthBanners() {
  const session = await auth()
  return (
    <SignupPromptBanner
      isLoggedIn={!!session?.user}
      createdAt={session?.user?.createdAt}
    />
  )
}
