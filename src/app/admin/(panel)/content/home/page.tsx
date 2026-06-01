import type { Metadata } from 'next'
import { getHomeCurationAdminView } from '@/lib/queries/admin/admin.home-curation'
import { composeHomeSectionsWithDiagnostics } from '@/lib/queries/posts/posts.home-compose'
import ContentNavTabs from '@/components/admin/ContentNavTabs'
import HomeCurationPanel from '@/components/admin/HomeCurationPanel'

export const metadata: Metadata = { title: '홈 편성 관리' }
export const dynamic = 'force-dynamic'

export default async function AdminHomeCurationPage() {
  const [adminView, previewData] = await Promise.all([
    getHomeCurationAdminView(),
    composeHomeSectionsWithDiagnostics(),
  ])

  const { diagnostics, ...preview } = previewData

  return (
    <div>
      <ContentNavTabs />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">홈 편성 수동 조정</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            자동화 정책 위에 고정(PIN) 또는 숨김(HIDE) 처리할 게시글을 지정합니다.
          </p>
        </div>
        <div className="text-xs text-zinc-400 text-right">
          <p>현재 편성: 뜨는 {diagnostics.trendingCount} · 사는 {diagnostics.storiesCount} · 웃음 {diagnostics.humorCount}</p>
          <p>기준시각: {new Date(diagnostics.generatedAt).toLocaleTimeString('ko-KR')}</p>
        </div>
      </div>

      <HomeCurationPanel initial={adminView} preview={preview} />
    </div>
  )
}
