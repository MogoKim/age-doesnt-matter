/**
 * 정적 기록관 빌더·게이트 테스트 — node 내장 러너.
 * 실행: npx tsx --test scripts/static-archive/static-archive.test.ts
 *
 * 🔴 위험 경로(저장소·홈·루트)는 assertSafeOutDir 로만 검사한다. buildAll 에 직접 넘기면
 *    가드가 고장 났을 때 실제 경로가 손상될 수 있으므로, buildAll 거부는 임시 디렉터리 + 보초 파일로만 본다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDES } from '../../src/lib/guides'
import { REPO_ROOT, assertSafeOutDir, buildAll } from './build'
import { ALLOWLIST, PHANTOM_COMMUNITY, loadExpectedManifest, verify } from './verify'
import { GUIDE_TEXT_OVERRIDES } from './guide-overrides'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const expected = loadExpectedManifest()

function tmpBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unao-archive-test-'))
}

function freshBuild(): string {
  const out = path.join(tmpBase(), 'out')
  buildAll(out)
  return out
}

function rewrite(out: string, file: string, fn: (s: string) => string): void {
  const p = path.join(out, file)
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')))
}

test('위험 경로는 --out 으로 쓸 수 없다 (저장소·내부·상위·홈·루트)', () => {
  const dangerous = [
    REPO_ROOT,
    path.join(REPO_ROOT, 'scripts'),
    path.join(REPO_ROOT, 'does-not-exist-yet'),
    path.dirname(REPO_ROOT),
    os.homedir(),
    path.join(os.homedir(), 'Documents'),
    path.parse(REPO_ROOT).root,
    '/',
  ]
  for (const p of dangerous) assert.throws(() => assertSafeOutDir(p), `거부되어야 함: ${p}`)
})

test('빌더 소스에 파일·디렉터리 삭제 API 가 없다', () => {
  const src = fs.readFileSync(path.join(HERE, 'build.ts'), 'utf8')
  assert.doesNotMatch(src, /\b(rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\s*\(/)
})

test('이미 존재하는 출력 경로는 거부하고 내용을 건드리지 않는다', () => {
  const base = tmpBase()
  const existingDir = path.join(base, 'existing')
  fs.mkdirSync(existingDir)
  fs.writeFileSync(path.join(existingDir, 'sentinel.txt'), 'keep')
  assert.throws(() => buildAll(existingDir))
  assert.equal(fs.readFileSync(path.join(existingDir, 'sentinel.txt'), 'utf8'), 'keep')
  assert.deepEqual(fs.readdirSync(existingDir), ['sentinel.txt'])

  const existingFile = path.join(base, 'file.txt')
  fs.writeFileSync(existingFile, 'keep')
  assert.throws(() => buildAll(existingFile))
  assert.equal(fs.readFileSync(existingFile, 'utf8'), 'keep')

  assert.throws(() => buildAll(path.join(base, 'no-parent', 'out')), '부모 디렉터리가 없으면 거부')
})

test('새 경로 빌드 → 전 게이트 PASS · expected manifest 13/13', () => {
  const out = freshBuild()
  const r = verify(out)
  assert.deepEqual(r.issues, [])
  assert.equal(r.summary.manifestMatched, 13)
  assert.equal(expected.length, 13)
  assert.deepEqual(
    expected.map((e) => e.path).sort(),
    [...ALLOWLIST].sort(),
  )
})

test('manifest 와 하나라도 다르면 FAIL (12/13)', () => {
  const out = freshBuild()
  rewrite(out, 'about.html', (s) => s.replace(/<title>[^<]*<\/title>/, '<title>바뀐 제목</title>'))
  const r = verify(out)
  assert.equal(r.summary.manifestMatched, 12)
  assert.ok(r.issues.some((i) => i.gate === 'G6-manifest'))
})

test('금지 문자열을 주입하면 FAIL', () => {
  const injections: Array<[string, string]> = [
    ['next-runtime', '<script src="/_next/static/a.js"></script>'],
    ['r2.dev', '<img src="https://pub-x.r2.dev/a.webp" alt="">'],
    ['r2-endpoint', '<img src="https://a.r2.cloudflarestorage.com/a.webp" alt="">'],
    ['next-image', '<img src="/_next/image?url=a" alt="">'],
    ['adsense', '<ins class="adsbygoogle"></ins>'],
    ['form-controls', '<form><button>공감</button></form>'],
    ['member-surface', '<a href="/community/stories">글</a>'],
  ]
  for (const [name, html] of injections) {
    const out = freshBuild()
    rewrite(out, 'index.html', (s) => s.replace('</main>', `${html}</main>`))
    const r = verify(out)
    assert.ok(
      r.issues.some((i) => i.detail.startsWith(`${name}:`) || i.gate === 'G2-script'),
      `${name} 주입이 FAIL 이 아님: ${JSON.stringify(r.issues.map((i) => i.detail.slice(0, 40)))}`,
    )
  }
})

test('허용 목록 밖 페이지를 만들면 FAIL', () => {
  const out = freshBuild()
  fs.writeFileSync(path.join(out, 'jobs.html'), '<!doctype html><title>x</title>')
  const r = verify(out)
  assert.ok(r.issues.some((i) => i.gate === 'G1-allowlist' && i.file === 'jobs.html'))
})

test('사라진 커뮤니티를 암시하는 문구가 산출물에 0건', () => {
  const out = freshBuild()
  const r = verify(out)
  assert.equal(r.issues.filter((i) => i.gate === 'G10-phantom-community').length, 0)
  for (const f of fs.readdirSync(out, { recursive: true }) as string[]) {
    if (!f.endsWith('.html')) continue
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    for (const re of PHANTOM_COMMUNITY) assert.doesNotMatch(s, re, `${f}: ${re}`)
  }
})

test('사라진 커뮤니티 암시 문구를 주입하면 FAIL', () => {
  const out = freshBuild()
  rewrite(out, 'guide.html', (s) => s.replace('</main>', '<p>요즘 시세는 아래 커뮤니티 이야기에서 확인하세요.</p></main>'))
  const r = verify(out)
  assert.ok(r.issues.some((i) => i.gate === 'G10-phantom-community'))
})

test('가이드 override 는 원본 문자열에 실제로 존재한다 (낡은 override 0)', () => {
  const all = JSON.stringify(GUIDES)
  for (const [from] of GUIDE_TEXT_OVERRIDES) assert.ok(all.includes(JSON.stringify(from).slice(1, -1)), `원본에 없음: ${from}`)
})

test('커뮤니티 암시 패턴은 일반 단어를 오탐하지 않는다', () => {
  const hit = (t: string): boolean => PHANTOM_COMMUNITY.some((re) => re.test(t))
  assert.equal(hit('수분이 많아 며칠 안에 쓰는 게 좋습니다.'), false)
  assert.equal(hit('이웃·커뮤니티 같은 기준으로 따져보면'), false)
  assert.equal(hit('새로 시작한 분이 많아요.'), true)
  assert.equal(hit('아래 커뮤니티 이야기에서 확인하세요.'), true)
  assert.equal(hit('| 40대 50대 여성 커뮤니티 : 우리 나이가 어때서'), true)
})
