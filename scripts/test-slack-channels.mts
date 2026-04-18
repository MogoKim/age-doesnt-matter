/**
 * Slack 채널 매핑 테스트 스크립트
 * 실행: npx tsx scripts/test-slack-channels.mts
 */
console.log('[WATCH] test-slack-channels.mts 실행됨 —', new Date().toISOString(), '| 2주 모니터링 대상')
import { config } from 'dotenv'
config({ path: '.env.local' })

import { WebClient } from '@slack/web-api'

const token = process.env.SLACK_BOT_TOKEN ?? ''
if (!token) {
  console.error('❌ SLACK_BOT_TOKEN 없음')
  process.exit(1)
}

const slack = new WebClient(token)

const channels: Record<string, string> = {
  DASHBOARD: process.env.SLACK_CHANNEL_DASHBOARD ?? '',
  REPORT: process.env.SLACK_CHANNEL_REPORT ?? '',
  QA: process.env.SLACK_CHANNEL_QA ?? '',
  SYSTEM: process.env.SLACK_CHANNEL_SYSTEM ?? '',
  LOG: process.env.SLACK_CHANNEL_LOG ?? '',
  AGENT: process.env.SLACK_CHANNEL_AGENT ?? '',
}

console.log('Slack 채널 매핑 테스트 시작...\n')

for (const [key, channelId] of Object.entries(channels)) {
  if (!channelId) {
    console.log(`⚠️  ${key}: 채널 ID 없음 — .env.local 확인 필요`)
    continue
  }
  try {
    const res = await slack.chat.postMessage({
      channel: channelId,
      text: `[로컬 테스트] notifier.ts 채널 매핑 확인 — ${key} ✅`,
    })
    console.log(`✅ ${key} (${channelId}): 전송 성공`)
  } catch (e: any) {
    console.log(`❌ ${key} (${channelId}): 전송 실패 — ${e.message}`)
  }
}

console.log('\n완료.')
