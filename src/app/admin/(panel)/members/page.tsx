import type { Metadata } from 'next'
import type { UserStatus } from '@/generated/prisma/client'
import { getMemberList } from '@/lib/queries/admin'
import MemberTable from '@/components/admin/MemberTable'

export const metadata: Metadata = { title: '회원 관리' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    status?: string
    search?: string
    cursor?: string
    bot?: string
  }>
}

export default async function AdminMembersPage({ searchParams }: Props) {
  const params = await searchParams
  // 기본값을 '실사용자만'(hide)으로 — 봇/시드 계정이 섞여 온보딩 현황 등이 오인되는 것 방지.
  // 명시적 '전체'는 bot=all, '봇만'은 bot=only.
  const botFilter = params.bot ?? 'hide'
  const { users, hasMore } = await getMemberList({
    status: params.status as UserStatus | undefined,
    search: params.search,
    cursor: params.cursor,
    botOnly: botFilter === 'only',
    hideBot: botFilter === 'hide',
  })

  return (
    <div className="space-y-4">
      <MemberTable
        users={users}
        hasMore={hasMore}
        filters={{
          status: params.status,
          search: params.search,
          bot: botFilter,
        }}
      />
    </div>
  )
}
