import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import ContentNavTabs from '@/components/admin/ContentNavTabs'
import { getPersonaRecentUsage } from '@/lib/queries/admin/admin.persona-usage'
import {
  FOUNDER_PERSONA_CANDIDATES,
  FOUNDER_PERSONA_EMAILS,
  findFounderPersonaCandidate,
} from '@/lib/founder-personas'
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
 *
 * 목록은 **DB에 실제로 있고 ACTIVE인 계정만** 보여준다. 후보 카탈로그(289종)에 있어도
 * 계정이 없으면 화면에 나오지 않는다 — 이 화면은 계정을 만들지 않는다.
 */
export default async function FounderPersonaPublishPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const accounts = await prisma.user.findMany({
    where: { email: { in: [...FOUNDER_PERSONA_EMAILS] }, status: 'ACTIVE' },
    select: { id: true, email: true, nickname: true },
  })

  // 계정 수와 무관하게 쿼리 2개 (N+1 아님)
  const usage = await getPersonaRecentUsage(accounts.map((a) => a.id))

  const options: PersonaOption[] = accounts
    .map((account) => {
      const candidate = account.email ? findFounderPersonaCandidate(account.email) : undefined
      if (!candidate || !account.email) return null
      const recent = usage.get(account.id)
      return {
        email: account.email,
        nickname: account.nickname,
        origin: candidate.origin,
        registryBoard: candidate.registryBoard,
        lastPostedAt: recent?.lastPostedAt.toISOString() ?? null,
        lastTitle: recent?.lastTitle ?? null,
        lastBoardType: recent?.lastBoardType ?? null,
      } satisfies PersonaOption
    })
    .filter((o): o is PersonaOption => o !== null)
    // 오래 안 쓴 페르소나가 위로 오게 — 한 번도 안 쓴 계정이 가장 위
    .sort((a, b) => (a.lastPostedAt ?? '').localeCompare(b.lastPostedAt ?? ''))

  const missingCount = FOUNDER_PERSONA_CANDIDATES.length - options.length

  return (
    <div>
      <ContentNavTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">페르소나 발행</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          직접 쓴 글을 <strong>이미 있는 페르소나 계정</strong> 이름으로 커뮤니티에 올립니다.
          미리보기까지는 저장되지 않고, <strong>발행</strong>을 눌렀을 때만 바로 공개됩니다. 이
          화면은 계정을 새로 만들지 않습니다.
        </p>
      </div>

      {options.length === 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          발행에 쓸 수 있는 ACTIVE 페르소나 계정이 DB에 하나도 없습니다. 후보{' '}
          {FOUNDER_PERSONA_CANDIDATES.length}종(과거 persona registry에서 canWritePost=true였던
          계정) 중 조회된 ACTIVE 계정이 0건입니다.
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-zinc-500">
            후보 {FOUNDER_PERSONA_CANDIDATES.length}종 중 ACTIVE 계정 <strong>{options.length}종</strong>
            {missingCount > 0 && ` (계정 없음·비활성 ${missingCount}종은 목록에서 제외)`}
          </p>
          <PersonaPublishForm options={options} />
        </>
      )}
    </div>
  )
}
