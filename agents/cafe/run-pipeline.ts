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
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')
const step = process.argv[2] ?? 'all'

// launchd 실행 시 .env.local 환경변수가 없으므로 직접 로드
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // 파일 없으면 무시
  }
}

loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

function run(script: string, label: string) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[Pipeline] ${label} 시작`)
  console.log('='.repeat(50))

  try {
    // stdio: 'inherit' — 자식 프로세스 출력을 부모에 직접 연결
    // execSync + pipe 조합은 출력 버퍼 초과 시 프로세스가 블로킹되어 ETIMEDOUT 발생
    execFileSync('npx', ['tsx', resolve(__dirname, script)], {
      env: { ...process.env },
      timeout: 900000, // 15분 — 크롤링은 카페당 2-3분 소요
      stdio: 'inherit',
    })
    console.log(`[Pipeline] ${label} ✅ 완료`)
  } catch (err: unknown) {
    const execErr = err as { status?: number; message?: string }
    console.error(`[Pipeline] ${label} ❌ 실패:`, execErr.message ?? err)
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
