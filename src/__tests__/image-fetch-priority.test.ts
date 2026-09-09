import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

/**
 * next/image 의 `priority` 는 Next 16 에서 의미가 좁아졌다.
 *
 * Next 14: `priority` → preload link + `loading="eager"` + **`fetchpriority="high"`**
 * Next 16: `priority` → preload link + `loading="eager"` 까지만.
 *          `fetchPriority` 는 별도 prop 으로 명시해야 한다.
 *
 * 실측(2026-09-09, 홈 모바일 Lighthouse 3회):
 *   Next 14 preview → `fetchpriority="high"` 3/3, LCP 2608~3348ms
 *   Next 16 preview → 속성 없음 3/3, LCP 3345~3463ms (Render Delay 1906ms)
 *
 * 조용히 사라지는 회귀라 사람 눈으로는 안 잡힌다. 소스에서 강제한다.
 */
const ROOT = path.resolve(__dirname, '../..')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function imageBlocks(source: string): string[] {
  // `<Image` 여는 태그부터 그 태그가 닫히는 `/>` 또는 `>` 까지
  const blocks: string[] = []
  const re = /<Image\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const rest = source.slice(m.index)
    const end = rest.search(/\/?>/)
    blocks.push(end === -1 ? rest : rest.slice(0, end + 2))
  }
  return blocks
}

describe('next/image priority 는 fetchPriority 를 동반해야 한다 (Next 16)', () => {
  const files = tsxFiles(path.join(ROOT, 'src'))

  it('priority 를 쓰는 모든 <Image> 에 fetchPriority 가 명시돼 있다', () => {
    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes("from 'next/image'")) continue
      for (const block of imageBlocks(source)) {
        if (!/\bpriority\b/.test(block)) continue
        if (!/\bfetchPriority\b/.test(block)) {
          missing.push(path.relative(ROOT, file))
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('홈 히어로(LCP 요소)는 첫 슬라이드에 high 를 준다', () => {
    const source = readFileSync(
      path.join(ROOT, 'src/components/features/home/HeroSliderClient.tsx'),
      'utf8',
    )
    expect(source).toContain("fetchPriority={index === 0 ? 'high' : undefined}")
  })
})
