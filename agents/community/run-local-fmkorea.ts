// LOCAL ONLY — 펨코는 Cloudflare가 해외 IP 차단, macOS launchd로 로컬 실행
/**
 * 펨코 시트 스크래퍼 로컬 런처
 * macOS에서 launchd를 통해 실행 (한국 IP 필요)
 *
 * 사용법: npx tsx agents/community/run-local-fmkorea.ts
 * 크론: ~/Library/LaunchAgents/com.unao.fmkorea-scraper.plist
 * 스케줄: 매일 11:30 / 21:30 KST (GA 시트 스크래퍼 30분 후)
 */
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// launchd 실행 시 .env 환경변수가 없으므로 직접 로드
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

console.log(`\n${'='.repeat(50)}`)
console.log('[FMKorea 로컬] 시트 스크래퍼 시작')
console.log('='.repeat(50))

try {
  execFileSync('npx', ['tsx', resolve(__dirname, 'sheet-scraper.ts'), '--site', 'fmkorea'], {
    env: { ...process.env },
    timeout: 900000, // 15분
    stdio: 'inherit',
  })
  console.log('[FMKorea 로컬] 완료')
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[FMKorea 로컬] 실패: ${msg}`)
  process.exit(1)
}
