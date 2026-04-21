import { prisma } from '@/lib/prisma'

/**
 * 제목에서 커뮤니티 slug 생성 (고유성 보장)
 * - 한글/영문/숫자만 유지, 공백은 하이픈으로
 * - DB unique 충돌 시 -2, -3 ... suffix 추가
 */
export async function generateCommunitySlug(title: string): Promise<string> {
  const base = title
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)

  if (!base) return `post-${Date.now()}`

  const exists = await prisma.post.findUnique({ where: { slug: base }, select: { id: true } })
  if (!exists) return base

  for (let i = 2; i <= 9; i++) {
    const candidate = `${base}-${i}`
    const dup = await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!dup) return candidate
  }

  return `${base}-${Date.now()}`
}
