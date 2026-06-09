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
    bot?: string
    sort?: string
    order?: string
    page?: string
  }>
}

export default async function AdminMembersPage({ searchParams }: Props) {
  const params = await searchParams
  // 기본값을 '실사용자만'(hide)으로 — 봇/시드 계정이 섞여 온보딩 현황 등이 오인되는 것 방지.
  // 명시적 '전체'는 bot=all, '봇만'은 bot=only.
  const botFilter = params.bot ?? 'hide'
  const { users, hasMore, page, sort, order } = await getMemberList({
    status: params.status as UserStatus | undefined,
    search: params.search,
    botOnly: botFilter === 'only',
    hideBot: botFilter === 'hide',
    sort: params.sort,
    order: params.order,
    page: params.page ? Number(params.page) : 1,
  })

  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-zinc-700">
          ℹ️ 제재하면 어떻게 되나요? (클릭해서 펼치기)
        </summary>
        <div className="mt-3 space-y-2 leading-relaxed text-zinc-600">
          <p>
            <b className="text-yellow-700">⚠️ 7일·30일 정지</b> — 기존 글·댓글은 그대로 보입니다.
            <b> 새 글·댓글 쓰기만 차단</b>되고, 정지 기간이 지나면 다음 로그인 때 <b>자동 해제</b>됩니다.
          </p>
          <p>
            <b className="text-red-700">🔴 영구 차단</b> — 기존 글·댓글이 <b>전부 즉시 숨겨지고</b>,
            글쓰기 차단 + 재로그인까지 막힙니다. 해제는 <b>수동</b>으로만 가능합니다.
          </p>
          <p>
            <b className="text-emerald-700">✅ 해제</b> — 정상으로 복구됩니다.
            (직전이 영구 차단이었던 경우 숨겼던 글·댓글도 다시 노출)
          </p>
          <p>
            <b>🔔 알림</b> — 제재 시 회원에게 사이트 안 알림(📢)이 1건 갑니다.
            단 <b>카카오톡·휴대폰 푸시·이메일로는 가지 않으며</b>, 회원이 사이트에 직접 접속해야
            종(🔔) 아이콘 → 「내 알림」에서 확인합니다. 모든 제재는 감사 로그에 기록됩니다.
          </p>
        </div>
      </details>
      <MemberTable
        users={users}
        hasMore={hasMore}
        page={page}
        sort={sort}
        order={order}
        filters={{
          status: params.status,
          search: params.search,
          bot: botFilter,
        }}
      />
    </div>
  )
}
