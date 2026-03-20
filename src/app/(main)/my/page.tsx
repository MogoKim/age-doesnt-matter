import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { getMyProfile } from '@/lib/queries/my'
import { GRADE_INFO } from '@/lib/grade'
import type { Grade } from '@/types/api'
import SignOutButton from '@/components/features/my/SignOutButton'

export const metadata: Metadata = {
  title: '마이페이지',
}

export default async function MyPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const profile = await getMyProfile(session.user.id)
  if (!profile) redirect('/login')

  const gradeInfo = GRADE_INFO[profile.grade as Grade]

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* 프로필 카드 */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl shrink-0">
            {gradeInfo?.emoji ?? '🌱'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{profile.nickname}</h1>
            <p className="text-sm text-muted-foreground">
              {gradeInfo?.emoji} {gradeInfo?.label ?? '새싹'} 등급
            </p>
          </div>
        </div>

        {/* 활동 통계 */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-background rounded-xl">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{profile.postCount}</p>
            <p className="text-xs text-muted-foreground">작성글</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{profile.commentCount}</p>
            <p className="text-xs text-muted-foreground">댓글</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{profile.receivedLikes}</p>
            <p className="text-xs text-muted-foreground">받은 공감</p>
          </div>
        </div>
      </div>

      {/* 메뉴 목록 */}
      <nav className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <MenuItem href="/my/posts" emoji="📝" label="내가 쓴 글" />
        <MenuItem href="/my/scraps" emoji="📌" label="스크랩한 글" />
        <div className="border-t border-border">
          <SignOutButton />
        </div>
      </nav>
    </div>
  )
}

function MenuItem({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 min-h-[56px] px-6 py-4 text-sm font-medium text-foreground no-underline transition-colors hover:bg-primary/5 border-b border-border last:border-b-0"
    >
      <span className="text-lg">{emoji}</span>
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground text-xs">→</span>
    </Link>
  )
}
