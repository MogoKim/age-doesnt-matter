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
  const { users, hasMore } = await getMemberList({
    status: params.status as UserStatus | undefined,
    search: params.search,
    cursor: params.cursor,
    botOnly: params.bot === 'only',
    hideBot: params.bot === 'hide',
  })

  return (
    <div className="space-y-4">
      <MemberTable
        users={users}
        hasMore={hasMore}
        filters={{
          status: params.status,
          search: params.search,
          bot: params.bot,
        }}
      />
    </div>
  )
}
