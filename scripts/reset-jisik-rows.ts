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
