import { prisma } from '@/lib/prisma'

let cachedWords: string[] | null = null
let cacheExpiry = 0

/**
 * 활성 금지어 목록을 가져온다 (5분 캐시)
 */
async function getBannedWords(): Promise<string[]> {
  const now = Date.now()
  if (cachedWords && cacheExpiry > now) return cachedWords

  const words = await prisma.bannedWord.findMany({
    where: { isActive: true },
    select: { word: true },
  })

  cachedWords = words.map((w) => w.word.toLowerCase())
  cacheExpiry = now + 5 * 60 * 1000 // 5분
  return cachedWords
}

/**
 * 텍스트에 금지어가 포함되어 있는지 검사한다.
 * 포함된 경우 해당 금지어를 반환, 없으면 null.
 */
export async function checkBannedWords(text: string): Promise<string | null> {
  const words = await getBannedWords()
  const lower = text.toLowerCase()

  for (const word of words) {
    if (lower.includes(word)) return word
  }

  return null
}
