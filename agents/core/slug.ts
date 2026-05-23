// agents 전용 slug 생성 — src/lib/seo/slug.ts와 동일 로직
// agents → src/ 런타임 import 금지 규칙으로 별도 구현 (CLAUDE.md)
import { prisma } from './db.js'

export async function generateCommunitySlug(title: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any
  const base = title
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)

  if (!base) return `post-${Date.now()}`

  try {
    const exists = await p.post.findUnique({ where: { slug: base }, select: { id: true } })
    if (!exists) return base

    for (let i = 2; i <= 9; i++) {
      const candidate = `${base}-${i}`
      const dup = await p.post.findUnique({ where: { slug: candidate }, select: { id: true } })
      if (!dup) return candidate
    }
  } catch {
    return `post-${Date.now()}`
  }

  return `${base}-${Date.now()}`
}
