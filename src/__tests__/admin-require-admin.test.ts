/**
 * 어드민 인증 가드 계약 — Foundation 3.0 (B).
 *
 * ── 위험은 본문이 아니라 호출 지점에 있다 ────────────────────
 *  같은 4줄이 어드민 액션 파일 10곳에 복사돼 있었다(호출 42회).
 *  본문이 같으니 합쳐도 안전하다 — 는 **틀린 논리**다.
 *  합치면서 호출 위치가 한 줄만 밀려도 **로그인하지 않은 요청이
 *  DB 를 먼저 건드릴 수 있다.** 그래서 여기서 보는 것은 값이 아니라
 *  "인증이 먼저 실행되는가 · 실패하면 아무 일도 일어나지 않는가" 다.
 *
 * ── 🔴 네 인증 형태를 섞지 않는다 ────────────────────────────
 *   ① actions/admin/** 10곳 — getAdminSession(admin-token) → 없으면 throw   ← 이번에 단일화
 *   ② lib/api-utils.ts — NextAuth 세션 + role==='ADMIN' → ForbiddenError
 *   ③ vote-events/actions.ts — getAdminSession 이지만 throw 대신 { error } 반환
 *   ④ admin.persona-publish.ts — ③과 같은 반환 계약 (2026-09-16 이 테스트가 발견)
 *  ②③④는 그대로 둔다. 반환 계약이 달라 합치면 호출부가 깨진다.
 *  이 테스트가 분리를 고정한다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ── 부수효과 감시 ─────────────────────────────────────────── */
const prismaCalls: string[] = []
const revalidateCalls: string[] = []
const fetchCalls: string[] = []

/** 어떤 속성 접근이든 기록하는 프록시 — prisma.x.y() 전부를 잡는다. */
function spyModel(model: string): unknown {
  return new Proxy({}, {
    get: (_t, op: string) => (...args: unknown[]) => {
      prismaCalls.push(`${model}.${op}`)
      void args
      return Promise.resolve(null)
    },
  })
}
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, {
    get: (_t, model: string) => {
      if (model === 'then') return undefined
      if (model === '$transaction') return (...a: unknown[]) => { prismaCalls.push('$transaction'); void a; return Promise.resolve([]) }
      return spyModel(model)
    },
  }),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => { revalidateCalls.push(p) },
  revalidateTag: (t: string) => { revalidateCalls.push(`tag:${t}`) },
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}))

/** 쿠키 없음 → 진짜 getAdminSession 이 null 을 돌려준다(가드를 mock 하지 않는다). */
let cookieValue: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookieValue ? { value: cookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
}))

const ROOT = resolve(process.cwd())
const SRC = join(ROOT, 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8')

beforeEach(() => {
  cookieValue = undefined
  prismaCalls.length = 0
  revalidateCalls.length = 0
  fetchCalls.length = 0
  vi.stubGlobal('fetch', (url: string) => { fetchCalls.push(String(url)); return Promise.resolve(new Response('{}')) })
})
afterEach(() => vi.unstubAllGlobals())

/* ── B-2. 인증 실패 시 부수효과 0 (모듈별) ────────────────────── */
const CASES: Array<[string, string, () => Promise<unknown>]> = [
  ['admin.automation', 'adminSetAutomationStatus', async () => (await import('@/lib/actions/admin/admin.automation')).adminSetAutomationStatus(true)],
  ['admin.banners', 'adminDeleteBanner', async () => (await import('@/lib/actions/admin/admin.banners')).adminDeleteBanner('b1')],
  ['admin.config', 'adminDeleteBannedWord', async () => (await import('@/lib/actions/admin/admin.config')).adminDeleteBannedWord('w1')],
  ['admin.content', 'adminSetPostLikeCount', async () => (await import('@/lib/actions/admin/admin.content')).adminSetPostLikeCount('p1', 5)],
  ['admin.experiments-web', 'adminSaveExperimentState', async () => (await import('@/lib/actions/admin/admin.experiments-web')).adminSaveExperimentState('k', 'v' as never)],
  ['admin.home-curation', 'deactivateHomeCurationOverride', async () => (await import('@/lib/actions/admin/admin.home-curation')).deactivateHomeCurationOverride('o1')],
  ['admin.members', 'adminUpdateUserGrade', async () => (await import('@/lib/actions/admin/admin.members')).adminUpdateUserGrade('u1', 'SPROUT' as never)],
  ['admin.queue', 'adminApproveQueueItem', async () => (await import('@/lib/actions/admin/admin.queue')).adminApproveQueueItem('q1')],
  ['admin.reports', 'adminProcessReport', async () => (await import('@/lib/actions/admin/admin.reports')).adminProcessReport('r1', 'DISMISS' as never)],
  ['popups', 'createPopup', async () => (await import('@/lib/actions/popups')).createPopup({} as never)],
]

describe('🔴 B-2 — 인증 실패 시 DB·캐시·외부 호출이 0이다', () => {
  it.each(CASES)('%s / %s', async (_mod, _fn, run) => {
    await expect(run()).rejects.toThrow('관리자 인증이 필요합니다.')
    expect(prismaCalls, `DB 를 건드렸다: ${prismaCalls.join(', ')}`).toEqual([])
    expect(revalidateCalls, `캐시를 무효화했다: ${revalidateCalls.join(', ')}`).toEqual([])
    expect(fetchCalls, `외부를 호출했다: ${fetchCalls.join(', ')}`).toEqual([])
  })
})

/* ── B-3. 에러 형태 ───────────────────────────────────────── */
describe('B-3 — 던지는 에러 형태가 그대로다', () => {
  it('Error 이고 문구가 바뀌지 않았다', async () => {
    const { requireAdminSession } = await import('@/lib/admin-auth')
    await expect(requireAdminSession()).rejects.toBeInstanceOf(Error)
    await expect(requireAdminSession()).rejects.toThrow('관리자 인증이 필요합니다.')
  })
})

/* ── B-5. 반환값 ──────────────────────────────────────────── */
describe('B-5 — 세션을 그대로 돌려준다', () => {
  it('유효한 토큰이면 adminId·email·nickname 이 담긴 세션을 반환한다', async () => {
    process.env.ADMIN_JWT_SECRET = 'x'.repeat(40)
    const { createAdminToken, requireAdminSession } = await import('@/lib/admin-auth')
    cookieValue = await createAdminToken({ adminId: 'a1', email: 'a@b.com', nickname: '관리자' })
    const s = await requireAdminSession()
    expect(s).toEqual({ adminId: 'a1', email: 'a@b.com', nickname: '관리자' })
  })

  it('서명이 깨진 토큰은 거절한다', async () => {
    process.env.ADMIN_JWT_SECRET = 'x'.repeat(40)
    const { createAdminToken, requireAdminSession } = await import('@/lib/admin-auth')
    const token = await createAdminToken({ adminId: 'a1', email: 'a@b.com', nickname: '관리자' })
    cookieValue = token.slice(0, -3) + 'AAA'
    await expect(requireAdminSession()).rejects.toThrow('관리자 인증이 필요합니다.')
  })
})

/* ── B-1·B-4·B-6·B-7. 소스 계약 ───────────────────────────── */
const ADMIN_ACTION_FILES = [
  ...readdirSync(join(SRC, 'lib/actions/admin'))
    .filter((f) => f.startsWith('admin.') && f.endsWith('.ts'))
    .map((f) => `lib/actions/admin/${f}`),
  'lib/actions/popups.ts',
]

describe('B-1 — 인증이 부수효과보다 먼저 실행된다', () => {
  it.each(ADMIN_ACTION_FILES)('%s — 모든 액션의 첫 await 이 requireAdmin 이다', (f) => {
    const src = read(f)
    const offenders: string[] = []
    // exported action 본문을 대략적으로 잘라, 첫 `await` 이 requireAdmin 인지 본다
    for (const m of src.matchAll(/export async function (\w+)\s*\([\s\S]*?\)[^{]*\{/g)) {
      const start = m.index! + m[0].length
      const body = src.slice(start, start + 1200)
      const firstAwait = body.match(/await\s+([\w.]+)/)
      if (!firstAwait) continue // await 이 없는 액션은 대상 아님
      // 인증이면 된다 — throw 형(requireAdmin)이든 반환 형(getAdminSession)이든
      // **부수효과보다 먼저** 실행되는지가 계약이다.
      if (!/requireAdmin|getAdminSession/.test(firstAwait[1])) offenders.push(`${m[1]} → ${firstAwait[1]}`)
    }
    expect(offenders, `인증보다 먼저 await 하는 액션: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('B-4 — 권한(role) 모델을 바꾸지 않았다', () => {
  it('정본 가드에 role 분기가 없다', () => {
    const src = read('lib/admin-auth.ts')
    const guard = src.slice(src.indexOf('export async function requireAdminSession'))
    expect(guard).not.toMatch(/\brole\b/)
    expect(guard).not.toMatch(/ForbiddenError/)
  })
})

describe('🔴 B-6 — 세 인증 체계가 여전히 셋이다', () => {
  it('api-utils 의 requireAdmin 은 NextAuth+role 그대로다', () => {
    const src = read('lib/api-utils.ts')
    expect(src).toMatch(/export async function requireAdmin\(\)/)
    expect(src).toMatch(/role !== 'ADMIN'/)
    expect(src).toMatch(/ForbiddenError/)
  })

  it('어드민 액션은 api-utils 의 가드를 쓰지 않는다', () => {
    for (const f of ADMIN_ACTION_FILES) {
      expect(read(f), `${f} 가 api-utils 가드를 가져온다`).not.toMatch(/requireAdmin[^\n]*from '@\/lib\/api-utils'/)
    }
  })

  it('vote-events 는 throw 가 아니라 { error } 를 반환한다 (계약 유지)', () => {
    const src = read('app/admin/(panel)/vote-events/actions.ts')
    expect(src).toMatch(/async function requireAdmin\(\): Promise<ActionResult \| null>/)
    expect(src).toMatch(/return \{ error: '관리자 인증이 필요합니다' \}/)
    expect(src).not.toMatch(/requireAdminSession/)
  })

  it('persona-publish 는 반환 계약을 유지한다 (throw 로 바꾸지 않는다)', () => {
    const src = read('lib/actions/admin/admin.persona-publish.ts')
    expect(src).toMatch(/const admin = await getAdminSession\(\)/)
    expect(src).toMatch(/if \(!admin\) return \{ error: '관리자 인증이 필요합니다\.' \}/)
    expect(src).not.toMatch(/requireAdminSession/)
  })

  it('10개 액션 파일에 복사본이 남지 않았다', () => {
    for (const f of ADMIN_ACTION_FILES) {
      expect(read(f), `${f} 에 복사본이 남았다`).not.toMatch(/async function requireAdmin\(\)\s*\{/)
    }
  })
})

describe('B-7 — 1차 방어선(middleware)은 건드리지 않았다', () => {
  it('middleware 가 /admin 진입을 admin-token 으로 계속 막는다', () => {
    const src = read('middleware.ts')
    expect(src).toContain("pathname.startsWith('/admin')")
    expect(src).toMatch(/admin-token/)
    expect(src).toMatch(/verifyAdminToken/)
  })

  it('middleware 는 새 가드를 쓰지 않는다 (변경 없음)', () => {
    expect(read('middleware.ts')).not.toMatch(/requireAdminSession/)
  })
})
