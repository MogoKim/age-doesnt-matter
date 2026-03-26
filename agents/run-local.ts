/**
 * 로컬 실행 래퍼 — .env + .env.local 로드 후 지정 스크립트 실행
 * 사용: npx tsx run-local.ts cafe/crawler.ts
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

// .env → .env.local 순서로 로드 (후자가 override)
config({ path: resolve(rootDir, '.env') })
config({ path: resolve(rootDir, '.env.local'), override: true })

const script = process.argv[2]
if (!script) {
  console.error('Usage: npx tsx run-local.ts <script>')
  process.exit(1)
}

await import(`./${script}`)
