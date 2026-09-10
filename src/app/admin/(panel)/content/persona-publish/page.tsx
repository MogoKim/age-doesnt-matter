import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import ContentNavTabs from '@/components/admin/ContentNavTabs'
import { getPersonaRecentUsage } from '@/lib/queries/admin/admin.persona-usage'
import {
  FOUNDER_PERSONAS,
  FOUNDER_PERSONA_EMAILS,
  findFounderPersona,
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
 * 목록은 **allowlist에 있고 DB에 ACTIVE로 존재하는 계정만** 보여준다.
 * 이 화면은 계정을 만들지 않는다.
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

  const options: PersonaOption[] = []
  for (const account of accounts) {
    const persona = account.email ? findFounderPersona(account.email) : undefined
    if (!persona || !account.email) continue
    const recent = usage.get(account.id)
    options.push({
      email: account.email,
      nickname: account.nickname,
      roleLabel: persona.roleLabel,
      voice: persona.voice,
      allowedBoardTypes: [...persona.allowedBoardTypes],
      lastPostedAt: recent?.lastPostedAt.toISOString() ?? null,
      lastTitle: recent?.lastTitle ?? null,
      lastBoardType: recent?.lastBoardType ?? null,
    })
  }
  // 오래 안 쓴 페르소나가 위로 오게 — 한 번도 공개 글이 없는 계정이 가장 위
  options.sort((a, b) => (a.lastPostedAt ?? '').localeCompare(b.lastPostedAt ?? ''))

  const missing = FOUNDER_PERSONAS.filter(
    (p) => !accounts.some((a) => a.email === p.email),
  ).map((p) => p.email)

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
          발행에 쓸 수 있는 ACTIVE 페르소나 계정이 DB에 하나도 없습니다. 허용 목록{' '}
          {FOUNDER_PERSONAS.length}종 중 조회된 ACTIVE 계정이 0건입니다.
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              계정 없음·비활성 {missing.length}종은 목록에서 제외됐습니다: {missing.join(', ')}
            </p>
          )}
          <PersonaPublishForm options={options} />
        </>
      )}
    </div>
  )
}
