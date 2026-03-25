/**
 * 카페 파이프라인 런처
 * 로컬 Mac에서 실행: 크롤링 → 트렌드 분석 → 콘텐츠 큐레이션 순차 실행
 *
 * 사용법:
 *   npx tsx agents/cafe/run-pipeline.ts          # 전체 파이프라인
 *   npx tsx agents/cafe/run-pipeline.ts crawl     # 크롤링만
 *   npx tsx agents/cafe/run-pipeline.ts analyze   # 분석만
 *   npx tsx agents/cafe/run-pipeline.ts curate    # 큐레이션만
 */
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const step = process.argv[2] ?? 'all'

function run(script: string, label: string) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[Pipeline] ${label} 시작`)
  console.log('='.repeat(50))

  try {
    execSync(`npx tsx ${resolve(__dirname, script)}`, {
      stdio: 'inherit',
      env: { ...process.env },
      timeout: 600000, // 10분
    })
    console.log(`[Pipeline] ${label} ✅ 완료`)
  } catch (err) {
    console.error(`[Pipeline] ${label} ❌ 실패:`, err)
    // 분석/큐레이션 실패해도 다음 단계 진행
  }
}

async function main() {
  const startTime = Date.now()
  console.log(`[Pipeline] 카페 콘텐츠 파이프라인 시작 — ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  console.log(`[Pipeline] 모드: ${step}`)

  if (step === 'all' || step === 'crawl') {
    run('crawler.ts', '1단계: 카페 크롤링')
  }

  if (step === 'all' || step === 'analyze') {
    run('trend-analyzer.ts', '2단계: 트렌드 분석')
  }

  if (step === 'all' || step === 'curate') {
    run('content-curator.ts', '3단계: 콘텐츠 큐레이션')
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`\n[Pipeline] 전체 완료 — ${elapsed}초`)
}

main()
