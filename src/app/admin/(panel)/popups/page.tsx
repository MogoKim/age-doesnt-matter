import type { Metadata } from 'next'
import { getPopupList } from '@/lib/actions/popups'
import PopupManager from '@/components/admin/PopupManager'

export const metadata: Metadata = { title: '팝업 관리' }

export default async function AdminPopupsPage() {
  const popups = await getPopupList()

  return (
    <div className="space-y-4">
      <PopupManager popups={popups} />
    </div>
  )
}
