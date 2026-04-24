import { prisma } from '@/lib/prisma'
import PushBroadcastForm from './PushBroadcastForm'

export const dynamic = 'force-dynamic'

export default async function AdminPushPage() {
  const subCount = await prisma.pushSubscription.count()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">푸시 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          현재 구독자 <span className="font-semibold text-zinc-900">{subCount.toLocaleString()}명</span>에게 푸시 알림을 발송합니다.
        </p>
      </div>

      <PushBroadcastForm subCount={subCount} />
    </div>
  )
}
