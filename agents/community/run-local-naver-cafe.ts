// LOCAL ONLY — 네이버 카페는 로그인 세션(storage-state.json) 필요, macOS launchd로 로컬 실행
/**
 * 네이버 카페 시트 스크래퍼 로컬 런처
 * macOS에서 launchd를 통해 실행 (storage-state.json 로그인 세션 필요)
 *
 * 사용법: npx tsx agents/community/run-local-naver-cafe.ts
 * 크론: ~/Library/LaunchAgents/com.unao.naver-cafe-sheet-scraper.plist
 * 스케줄: 매일 13:00 / 23:00 KST (fmkorea 11:30/21:30, cafe-crawler 11:30/21:30과 충돌 없음)
 *
 * 동영상 처리: 네이버 카페 동영상은 지원 제외 — 텍스트/이미지/댓글만 발행
 * storage-state.json 없으면 자동 skip (Sheet 상태 PENDING 유지)
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
console.log('[네이버 카페 로컬] 시트 스크래퍼 시작')
console.log('='.repeat(50))

try {
  execFileSync('npx', ['tsx', resolve(__dirname, 'sheet-scraper.ts'), '--site', 'navercafe'], {
    env: { ...process.env },
    timeout: 900000, // 15분
    stdio: 'inherit',
  })
  console.log('[네이버 카페 로컬] 완료')
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[네이버 카페 로컬] 실패: ${msg}`)
  process.exit(1)
}
