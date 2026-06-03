// curator-users.ts — 큐레이터 봇 유저 DB 관리
// curator-shared.ts는 순수함수만 유지 → DB 사이드이펙트는 이 파일에서만 처리
import { prisma } from '../core/db.js'
import { PERSONAS, type PersonaMatch } from './curator-shared.js'

export const AUTHOR_DAILY_POST_CAP = 2

export async function getCuratorBotUser(persona: string | PersonaMatch): Promise<string> {
  const id = typeof persona === 'string' ? persona : persona.id
  const nickname = typeof persona === 'string'
    ? (PERSONAS.find(p => p.id === id)?.nickname ?? id)
    : persona.nickname
  const email = `curator-${id.toLowerCase()}@unao.bot`
  const providerId = `curator-${id.toLowerCase()}`
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { nickname },
      create: { email, nickname, providerId, role: 'USER', grade: 'SPROUT' },
    })
    return user.id
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      // Prisma 7.x: meta는 Record<string, unknown> → target은 unknown. string[] (PG) 또는 string 모두 방어
      const rawTarget = (err as { meta?: Record<string, unknown> }).meta?.['target']
      const errMsg = (err as { message?: string }).message ?? ''
      // driver adapter(@prisma/adapter-pg)는 meta.target 미제공 → message 폴백
      const isNicknameConflict = rawTarget === undefined
        ? errMsg.includes('nickname')
        : Array.isArray(rawTarget)
          ? rawTarget.includes('nickname')
          : typeof rawTarget === 'string' && rawTarget.includes('nickname')
      // nickname 외 필드(providerId 등) P2002는 masking하지 않고 원본 에러 유지
      if (!isNicknameConflict) throw err
      throw new Error(`[CuratorUser] nickname conflict: ${nickname} (${email}). Use a unique curator nickname.`)
    }
    throw err
  }
}

export async function countTodayPostsByPersona(personaId: string): Promise<number> {
  const email = `curator-${personaId.toLowerCase()}@unao.bot`
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return 0
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return prisma.post.count({ where: { authorId: user.id, createdAt: { gte: todayStart } } })
}
