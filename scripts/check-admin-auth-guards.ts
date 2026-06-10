/**
 * 어드민 인증 가드 누락 검사 (F-1 재발 방지)
 *
 * 배경: adminBroadcastPush(push/actions.ts)에 getAdminSession() 가드가 빠져
 *       비인증 호출로 전체 회원 푸시가 가능했던 사고(2026-06-10 보안 감사 F-1).
 *
 * 규칙: 어드민 server action 파일(`'use server'` + admin 경로)에 export된 async function이
 *       있으면, 그 파일은 반드시 getAdminSession 또는 requireAdmin 호출을 포함해야 한다.
 *       (배럴 re-export 파일처럼 export async function이 없는 파일은 면제)
 *
 * 실행: npx tsx scripts/check-admin-auth-guards.ts
 * CI: ci.yml에서 src 변경 시 실행 (orphan 0 강제)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/app/admin', 'src/lib/actions/admin']
const GUARD = /getAdminSession|requireAdmin/
const EXPORTED_ACTION = /export\s+async\s+function/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const violations: string[] = []
let checked = 0

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    const isServerAction = src.includes("'use server'") || file.includes('/actions/admin/')
    if (!isServerAction) continue
    if (!EXPORTED_ACTION.test(src)) continue // 배럴/타입 전용 파일 면제
    checked++
    if (!GUARD.test(src)) violations.push(file)
  }
}

if (violations.length > 0) {
  console.error('❌ 어드민 인증 가드 누락 — getAdminSession/requireAdmin 호출이 없는 server action 파일:')
  for (const f of violations) console.error(`   - ${f}`)
  console.error('\n→ 다른 admin 액션처럼 함수 시작부에 인증 가드를 추가하세요 (F-1 재발 방지).')
  process.exit(1)
}

console.log(`✅ 어드민 server action 인증 가드 검사 통과 (${checked}개 파일 확인)`)
