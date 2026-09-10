import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import ContentNavTabs from '@/components/admin/ContentNavTabs'
import { FOUNDER_PERSONAS } from '@/lib/founder-personas'
import PersonaPublishForm, { type PersonaOption } from './PersonaPublishForm'

export const metadata: Metadata = { title: '페르소나 발행' }
export const dynamic = 'force-dynamic'

/**
 * 창업자 페르소나 발행 화면.
 *
 * 진입은 직접 URL(`/admin/content/persona-publish`)로만 한다 — 어드민 메인·사이드바·
 * 콘텐츠 목록에 링크를 넣지 않는다(다른 세션과의 충돌 방지, 링크 추가는 별도 후속 작업).
 *
 * 인증은 `(panel)/layout.tsx`가 이미 막지만, 이 페이지에서도 getAdminSession()으로 재검증한다.
 */
export default async function FounderPersonaPublishPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  // 카탈로그의 accountEmail에 해당하는 계정만 조회한다(생성하지 않는다).
  const accounts = await prisma.user.findMany({
    where: { email: { in: FOUNDER_PERSONAS.map((p) => p.accountEmail) } },
    select: { email: true, nickname: true, status: true },
  })
  const byEmail = new Map(accounts.map((a) => [a.email, a]))

  const options: PersonaOption[] = FOUNDER_PERSONAS.map((p) => {
    const account = byEmail.get(p.accountEmail)
    const unavailableReason = !account
      ? `계정 없음 (${p.accountEmail})`
      : account.status !== 'ACTIVE'
        ? `계정 비활성 (${account.status})`
        : null
    return {
      id: p.id,
      displayName: p.displayName,
      accountEmail: p.accountEmail,
      boardTypes: [...p.boardTypes],
      voice: p.voice,
      nickname: account?.nickname ?? null,
      unavailableReason,
    }
  })

  const availableCount = options.filter((o) => !o.unavailableReason).length

  return (
    <div>
      <ContentNavTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">페르소나 발행</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          직접 쓴 글을 지정한 페르소나 계정 이름으로 커뮤니티에 올립니다. 미리보기까지는 저장되지
          않고, <strong>발행</strong>을 눌렀을 때만 바로 공개됩니다.
        </p>
      </div>

      {availableCount === 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          발행 가능한 페르소나 계정이 하나도 없습니다. 아래 목록의 이메일로 <code>@unao.bot</code>{' '}
          계정을 먼저 만들어 주세요. (계정은 이 화면에서 자동 생성되지 않습니다.)
        </div>
      )}

      <PersonaPublishForm options={options} />
    </div>
  )
}
