// ⚠️ ONE-TIME SCRIPT — 재실행 금지
// 실행됨: 2026-04-05 지식인 답변 봇 초기화용
// 이 스크립트를 다시 실행하면 Google Sheet 행 2/4/6이 'Ready'로 초기화됨
import { updateStatus } from '../agents/community/jisik-sheets-client.js'

async function run() {
  await updateStatus(2, 'Ready')
  console.log('행 2 → Ready')
  await updateStatus(4, 'Ready')
  console.log('행 4 → Ready')
  await updateStatus(6, 'Ready')
  console.log('행 6 → Ready')
  console.log('✅ 완료')
  process.exit(0)
}
run().catch((e) => { console.error(e); process.exit(1) })
