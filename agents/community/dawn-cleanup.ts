// 새벽 시트 cleanup — 07:10 KST. `사는이야기_새벽` 탭에서 스케줄 시간이 지났는데
// 아직 PENDING인 행(예약시각 01:00~07:00 유효값)만 FAILED + "스케줄 시간 경과"로 마킹한다.
// PROCESSING/PUBLISHED/FAILED/HOLD는 readPendingRows가 PENDING만 반환하므로 애초에 미대상.
// 처리 못한 행은 창업자가 다음날 수동으로 PENDING 되돌려 재사용(코드 무관).
// runner: 'community:dawn-sheet-cleanup'
import { markMissedDawnRows } from './sheets-client.js'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

export async function main() {
  console.log('[dawn-cleanup] 새벽 탭 미처리 정리 시작')
  let failedRows = 0
  let status: 'SUCCESS' | 'FAILED' = 'SUCCESS'
  try {
    failedRows = await markMissedDawnRows()
  } catch (err) {
    status = 'FAILED'
    console.error('[dawn-cleanup] 실패:', err)
  }

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'DAWN_SHEET_CLEANUP',
      status,
      itemCount: failedRows,
      details: JSON.stringify({ failedRows, reason: '스케줄 시간 경과' }),
    },
  }).catch(e => console.error('[dawn-cleanup] BotLog 기록 실패:', e))

  await notifySlack({
    level: 'info',
    agent: 'DAWN_CLEANUP',
    title: '새벽 시트 정리',
    body: `사는이야기_새벽 미처리 ${failedRows}건 FAILED 처리 (스케줄 시간 경과)`,
  }).catch(() => {})

  console.log(`[dawn-cleanup] 완료 — ${failedRows}건 FAILED`)
  await disconnect()
}
