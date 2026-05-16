/**
 * 네이버 블로그 포스터 launchd 진입점
 *
 * // LOCAL ONLY — macOS launchd 전용 (GitHub Actions 실행 불가)
 *
 * 스케줄 (plist 설정, KST 로컬 타임존 기준):
 *   morning: 15:00 KST (magazine 12:00 + 14:00 두 건 처리)
 *   evening: 비활성화 (naver-blog-evening.plist unloaded)
 *
 * 실행:
 *   npx tsx agents/naver-blog/local-blog-runner.ts
 *   DRY_RUN=true npx tsx agents/naver-blog/local-blog-runner.ts
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ── 환경변수 로드 (launchd는 .env.local을 상속하지 않음) ──
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* 파일 없으면 무시 */ }
}
loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

// ── 시작 Jitter (안티-탐지: ±5분 랜덤 지연) ──
// DRY_RUN 모드에서는 jitter 없이 즉시 실행
const DRY_RUN = process.env.DRY_RUN === 'true'
if (!DRY_RUN) {
  const JITTER_MS = Math.floor(Math.random() * 5 * 60 * 1000)  // 0~5분
  console.log(`[BlogRunner] 시작 jitter: ${Math.floor(JITTER_MS / 1000)}초 대기`)
  await new Promise<void>(r => setTimeout(r, JITTER_MS))
}

// ── notifier 로드 (env 로드 이후) ──
const { sendSlackMessage } = await import('../core/notifier.js')

// ── 메인 실행 ──
async function main(): Promise<void> {
  const { runPoster } = await import('./poster.js')
  await runPoster()
}

main().catch(async (err) => {
  const errMsg = err instanceof Error ? err.message : String(err)
  console.error('[BlogRunner] 치명적 오류:', errMsg)

  try {
    await sendSlackMessage({
      channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
      level: 'critical',
      message: `🚨 *네이버 블로그 런너 치명적 오류*\n${errMsg}\n\`npx tsx agents/naver-blog/local-blog-runner.ts\``,
    })
  } catch { /* Slack 실패는 무시 */ }

  process.exit(0)  // exit 0 — launchd가 반복 재시작하지 않도록
})
