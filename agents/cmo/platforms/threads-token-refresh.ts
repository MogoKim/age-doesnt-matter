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

  // --- 선제 만료 경고: 마지막 성공 로그의 expiresAt 확인 ---
  try {
    const lastSuccess = await prisma.botLog.findFirst({
      where: { action: 'THREADS_TOKEN_REFRESH', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    })

    if (lastSuccess?.details) {
      const parsed = JSON.parse(lastSuccess.details) as { expiresAt?: string }
      if (parsed.expiresAt) {
        const expiresAt = new Date(parsed.expiresAt)
        const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

        if (daysLeft <= 7) {
          await notifySlack({
            level: 'critical',
            agent: 'CMO',
            title: `Threads 토큰 만료 임박 — ${daysLeft}일 남음`,
            body: [
              `만료 예정: ${expiresAt.toISOString()}`,
              '이번 갱신 실패 시 토큰이 만료될 수 있습니다.',
              '갱신 결과를 확인하고, 실패 시 즉시 수동 재발급하세요.',
            ].join('\n'),
          })
        }
      }
    }
  } catch (warnErr) {
    // 선제 경고 실패는 갱신 자체를 막지 않음
    console.warn('[ThreadsTokenRefresh] 만료 경고 확인 실패 (무시):', warnErr)
  }

  // --- 토큰 갱신 ---
  try {
    const { token: newToken, expiresIn } = await threadsClient.refreshLongLivedToken()
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'THREADS_TOKEN_REFRESH',
        status: 'SUCCESS',
        details: JSON.stringify({
          tokenPrefix: newToken.slice(0, 10) + '...',
          refreshedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          expiresInDays: Math.floor(expiresIn / 86400),
        }),
        itemCount: 1,
        executionTimeMs: 0,
      },
    })

    await notifySlack({
      level: 'info',
      agent: 'CMO',
      title: 'Threads 토큰 갱신 완료',
      body: [
        `새 토큰 발급됨. 만료: ${expiresAt.toISOString().slice(0, 10)} (~${Math.floor(expiresIn / 86400)}일 후)`,
        `⚠️ GitHub Secrets의 THREADS_ACCESS_TOKEN도 업데이트 필요:`,
        `\`${newToken.slice(0, 10)}...${newToken.slice(-6)}\``,
      ].join('\n'),
    })

    console.log('[ThreadsTokenRefresh] 갱신 성공. 만료:', expiresAt.toISOString())
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
      agent: 'CMO',
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
