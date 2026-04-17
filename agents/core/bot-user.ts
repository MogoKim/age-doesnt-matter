import { prisma } from './db.js'

/**
 * 봇 유저 조회/생성 공통 유틸
 *
 * caregiving-curator, humor-curator, health-anxiety-responder, job-scraper에서
 * 각자 동일하게 구현하던 ensureBotUser 패턴을 통합.
 *
 * @param email        봇 유저 이메일 (예: 'bot-humor@unao.bot')
 * @param nickname     봇 닉네임 (예: '웃음배달부')
 * @param providerPrefix providerId 접두사 (예: 'bot-humor')
 * @returns 봇 유저 ID (string)
 */
export async function ensureBotUser(
  email: string,
  nickname: string,
  providerPrefix: string,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      nickname,
      providerId: `${providerPrefix}-${Date.now()}`,
      role: 'USER',
      grade: 'WARM_NEIGHBOR',
    },
  })
  return user.id
}
