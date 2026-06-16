import type { Metadata } from 'next'
import { getBestCurationAdminView } from '@/lib/queries/admin/admin.home-curation'
import { composeBestHot, composeBestFame } from '@/lib/queries/posts/posts.best-compose'
import ContentNavTabs from '@/components/admin/ContentNavTabs'
import BestCurationPanel from '@/components/admin/BestCurationPanel'

export const metadata: Metadata = { title: '베스트 편성 관리' }
export const dynamic = 'force-dynamic'

export default async function AdminBestCurationPage() {
  // 어드민은 2페이지 분량(24개)을 관리 — /best 공개 페이지는 12개씩 페이지네이션
  const [adminView, hot, fame] = await Promise.all([
    getBestCurationAdminView(),
    composeBestHot({ limit: 24 }),
    composeBestFame({ limit: 24 }),
  ])

  return (
    <div>
      <ContentNavTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">베스트 편성 수동 조정</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          /best 뜨는 이야기·명예의 전당에 고정(PIN)·숨김(HIDE)·순서를 지정합니다. 자동 인기글 위에 적용됩니다.
        </p>
      </div>

      <BestCurationPanel initial={adminView} previewHot={hot.posts} previewFame={fame.posts} />
    </div>
  )
}
