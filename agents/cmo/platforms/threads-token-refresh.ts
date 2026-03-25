/**
 * Threads 토큰 자동 갱신 — 매주 수요일 10:00 KST 실행
 *
 * Long-lived token(60일)을 만료 전에 갱신.
 * 갱신 실패 시 Slack 긴급 알림 → 창업자가 수동 재발급.
 */

import { prisma, disconnect } from '../../core/db.js'
import { notifySlack } from '../../core/notifier.js'
import * as threadsClient from './threads-client.js'

async function main() {
  console.log('[ThreadsTokenRefresh] 시작')

  if (!threadsClient.isConfigured()) {
    console.log('[ThreadsTokenRefresh] Threads API 미설정 — 스킵')
    await disconnect()
    return
  }

  try {
    const newToken = await threadsClient.refreshLongLivedToken()

    // 성공 로그
    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'THREADS_TOKEN_REFRESH',
        status: 'SUCCESS',
        details: JSON.stringify({
          tokenPrefix: newToken.slice(0, 10) + '...',
          refreshedAt: new Date().toISOString(),
        }),
        itemCount: 1,
        executionTimeMs: 0,
      },
    })

    await notifySlack({
      level: 'info',
      agent: 'CMO_SOCIAL',
      title: 'Threads 토큰 갱신 완료',
      body: `새 토큰 발급됨 (60일 유효). 다음 갱신: ~53일 후.\n⚠️ GitHub Secrets의 THREADS_ACCESS_TOKEN도 업데이트 필요:\n\`${newToken.slice(0, 10)}...${newToken.slice(-6)}\``,
    })

    console.log('[ThreadsTokenRefresh] 갱신 성공')
  } catch (err) {
    console.error('[ThreadsTokenRefresh] 갱신 실패:', err)

    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'THREADS_TOKEN_REFRESH',
        status: 'FAILURE',
        details: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        itemCount: 0,
        executionTimeMs: 0,
      },
    })

    await notifySlack({
      level: 'critical',
      agent: 'CMO_SOCIAL',
      title: 'Threads 토큰 갱신 실패 — 수동 재발급 필요',
      body: [
        `오류: ${err instanceof Error ? err.message : String(err)}`,
        '',
        '토큰 만료 시 Threads 게시 불가.',
        '1. /api/threads/auth 에 접속하여 OAuth 재인증',
        '2. 발급된 토큰을 GitHub Secrets에 저장',
      ].join('\n'),
    })
  }

  await disconnect()
}

main().catch(async (err) => {
  console.error('[ThreadsTokenRefresh] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
