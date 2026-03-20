import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMySettings } from '@/lib/queries/my'
import FontSizeSettings from '@/components/features/my/FontSizeSettings'
import NicknameSettings from '@/components/features/my/NicknameSettings'
import BlockedUserList from '@/components/features/my/BlockedUserList'
import WithdrawSection from '@/components/features/my/WithdrawSection'

export const metadata = { title: '설정' }

export default async function MySettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const settings = await getMySettings(session.user.id)
  if (!settings) redirect('/login')

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">⚙️ 설정</h1>

      <div className="space-y-6">
        {/* 닉네임 변경 */}
        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-base font-bold text-foreground mb-4">닉네임 변경</h2>
          <NicknameSettings
            currentNickname={settings.nickname}
            canChange={settings.canChangeNickname}
            lastChangedAt={settings.nicknameChangedAt}
          />
        </section>

        {/* 글자 크기 */}
        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-base font-bold text-foreground mb-4">글자 크기</h2>
          <FontSizeSettings currentSize={settings.fontSize} />
        </section>

        {/* 차단 관리 */}
        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-base font-bold text-foreground mb-4">차단 관리</h2>
          <BlockedUserList />
        </section>
        {/* 회원 탈퇴 */}
        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-base font-bold text-foreground mb-4">회원 탈퇴</h2>
          <WithdrawSection />
        </section>
      </div>
    </div>
  )
}
