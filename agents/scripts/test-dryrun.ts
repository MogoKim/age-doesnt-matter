// DRY_RUN 샘플 테스트 — Step 3 검증
// 실행: DRY_RUN=true npx tsx --env-file=.env.local agents/scripts/test-dryrun.ts
import { generatePost } from '../seed/generator.js'

async function main() {
  console.log('=== DRY_RUN 샘플 1: BD (FAMILY) ===')
  const r1 = await generatePost('BD')
  console.log('title:', r1.title)
  console.log('variationType:', r1.variationType ?? 'none (20% 확률 미적중 or DNA 없음)')
  console.log('content:', r1.content)
  console.log()

  console.log('=== DRY_RUN 샘플 2: W (CARE) ===')
  const r2 = await generatePost('W')
  console.log('title:', r2.title)
  console.log('variationType:', r2.variationType ?? 'none (20% 확률 미적중 or DNA 없음)')
  console.log('content:', r2.content)
  console.log()

  console.log('=== DRY_RUN_OK ===')
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
