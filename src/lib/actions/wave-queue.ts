'use server'

import { prisma } from '@/lib/prisma'

export async function enqueueUserPostWave(postId: string, authorId: string): Promise<void> {
  const now = new Date()
  await prisma.userPostWaveQueue.create({
    data: {
      postId,
      authorId,
      wave1At: new Date(now.getTime() + 60_000),         // +1분
      wave2At: new Date(now.getTime() + 600_000),        // +10분
      wave3At: new Date(now.getTime() + 1_800_000),      // +30분
      wave4At: new Date(now.getTime() + 3_600_000),      // +60분
      expiresAt: new Date(now.getTime() + 86_400_000),   // +24h TTL
    },
  })
}
