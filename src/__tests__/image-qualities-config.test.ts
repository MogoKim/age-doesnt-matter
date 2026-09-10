import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * `next.config.js` 의 `images.qualities` 를 지킨다.
 *
 * 배경(2026-09-10 production 실측): Next 16 부터 허용 목록 밖의 `q` 는 **400 으로 거부**되고
 * 기본값은 `[75]` 다. 그런데 저장된 매거진 본문 HTML 에는 `sanitize.ts` 가 만든 `&q=80` URL 이
 * 이미 들어 있다 — **매거진 22페이지 · 고유 이미지 55건이 전부 400** 이었다.
 * 같은 이미지의 **원본 R2 URL 은 55/55 모두 200** 이었으니, 깨진 것은 프록시 계층뿐이다.
 *
 * 🔴 생성 코드를 `q=75` 로 바꾸는 것만으로는 **복구되지 않는다.**
 * 이미 저장된 HTML 은 그대로 `q=80` 을 요청한다. DB·저장 HTML 을 고치지 않기로 한 이상
 * `80` 은 허용 목록에 남아 있어야 한다.
 */
const ROOT = path.resolve(__dirname, '../..')
const config = readFileSync(path.join(ROOT, 'next.config.js'), 'utf8')

function qualitiesArray(): number[] {
  const m = config.match(/qualities:\s*\[([^\]]*)\]/)
  if (!m) return []
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
}

describe('[IMG-1] images.qualities 는 저장된 콘텐츠의 q 를 전부 담는다', () => {
  it('qualities 가 명시돼 있다 — 없으면 Next 16 기본값 [75] 로 좁혀진다', () => {
    expect(config, 'images.qualities 가 없으면 q=80 이 400 으로 거부된다').toMatch(/qualities:\s*\[/)
  })

  it('75 와 80 을 모두 허용한다', () => {
    const q = qualitiesArray()
    expect(q).toContain(75)
    expect(q, '80 을 빼면 저장된 매거진 22페이지의 이미지 55건이 다시 400 이 된다').toContain(80)
  })

  it('저장 콘텐츠를 만드는 코드가 쓰는 q 값이 전부 허용 목록에 있다', () => {
    const allowed = new Set(qualitiesArray())
    const sources = ['src/lib/sanitize.ts', 'src/components/features/community/TipTapEditor.tsx']
    const used = new Set<number>()
    for (const rel of sources) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8')
      for (const m of src.matchAll(/\/_next\/image\?[^`'"]*?[?&]q=(\d+)/g)) used.add(Number(m[1]))
    }
    expect(used.size, '프록시 URL 을 만드는 코드를 찾지 못했다').toBeGreaterThan(0)
    for (const q of used) {
      expect(allowed, `코드가 q=${q} 를 만드는데 qualities 에 없다 — 그 이미지는 400 이 된다`).toContain(q)
    }
  })
})
