import { prisma, disconnect } from '../core/db.js'
import { sendSlackMessage } from '../core/notifier.js'

async function main() {
  console.log('[ApprovalReminder] 시작')

  // 1. 48시간 초과 PENDING → EXPIRED
  const expiryCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const expired = await prisma.adminQueue.updateMany({
    where: { status: 'PENDING', createdAt: { lt: expiryCutoff } },
    data: { status: 'EXPIRED' },
  })
  if (expired.count > 0) {
    console.log(`[ApprovalReminder] ${expired.count}건 만료 처리`)
  }

  // 2. 현재 PENDING 건 리마인더
  const pending = await prisma.adminQueue.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  if (pending.length > 0) {
    const lines = pending.map((item) =>
      `• *${item.id.slice(-6)}* | ${item.type} | ${item.title}\n  └ ${item.requestedBy} · ${item.createdAt.toLocaleDateString('ko-KR')}`
    )

    await sendSlackMessage('DASHBOARD', `⏰ *승인 대기 ${pending.length}건*\n\n${lines.join('\n\n')}\n\n\`/una-approve [ID]\` 로 승인하거나 위 메시지의 버튼을 클릭하세요.`)
  }

  console.log(`[ApprovalReminder] 완료 — PENDING ${pending.length}건, 만료 ${expired.count}건`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[ApprovalReminder] 오류:', err)
  await disconnect()
  process.exit(1)
})
