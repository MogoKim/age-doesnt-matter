import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CMO Band Manager -- Band 커뮤니티 관리 에이전트
 *
 * Band API 심사중이므로 현재 stub 구현.
 * API 키 설정 시 자동으로 Band 포스팅 로직 활성화 예정.
 *
 * 흐름:
 * 1. BAND_API_KEY 환경변수 확인
 * 2. 미설정 시: 로그 남기고 종료
 * 3. 설정 시: Band 포스팅 로직 (TODO)
 */

// -- 메인 실행 --

async function main() {
  console.log('[BandManager] 시작')
  const startTime = Date.now()

  const bandApiKey = process.env.BAND_API_KEY

  if (!bandApiKey) {
    console.log('[BandManager] Band API 미설정 -- 스킵')

    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'BAND_MANAGE',
        status: 'PARTIAL',
        details: JSON.stringify({ reason: 'Band API 미설정 -- 스킵' }),
        itemCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    })

    await disconnect()
    return
  }

  // ──────────────────────────────────────────────────
  // TODO: Band API 승인 후 아래 로직 구현
  //
  // 예정 기능:
  // 1. 오늘의 인기 콘텐츠 수집 (Post 테이블)
  // 2. Band 맞춤 포맷으로 변환 (짧고 친근한 톤)
  // 3. Band API로 게시
  // 4. 참여도 데이터 수집 + 분석
  //
  // Band API 문서: https://developers.band.us/
  // ──────────────────────────────────────────────────

  console.log('[BandManager] Band API 키 확인됨 -- 포스팅 로직 실행 예정')

  // placeholder: API 연결 테스트
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: 'Band Manager 활성화됨',
    body: 'Band API 키가 설정되었습니다. 포스팅 로직 구현이 필요합니다.',
  })

  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'BAND_MANAGE',
      status: 'SUCCESS',
      details: JSON.stringify({ reason: 'Band API 키 확인됨, 포스팅 로직 미구현 (stub)' }),
      itemCount: 0,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[BandManager] 완료 -- ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[BandManager] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: 'Band Manager 실행 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
