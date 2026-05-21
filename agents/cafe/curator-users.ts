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
  const user = await prisma.user.upsert({
    where: { email },
    update: { nickname },
    create: { email, nickname, providerId: `curator-${id.toLowerCase()}`, role: 'USER', grade: 'SPROUT' },
  })
  return user.id
}

export async function countTodayPostsByPersona(personaId: string): Promise<number> {
  const email = `curator-${personaId.toLowerCase()}@unao.bot`
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return 0
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return prisma.post.count({ where: { authorId: user.id, createdAt: { gte: todayStart } } })
}
