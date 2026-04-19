import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { flags } from '@/lib/feature-flags'
import type { PushPayload } from './types'

const BASE_URL = 'https://age-doesnt-matter.com'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

class PushService {
  // UTM 자동 삽입
  private buildUrl(url: string, campaign: string): string {
    try {
      const u = new URL(url, BASE_URL)
      u.searchParams.set('utm_source', 'webpush')
      u.searchParams.set('utm_medium', 'push')
      u.searchParams.set('utm_campaign', campaign)
      return u.pathname + u.search
    } catch {
      return url
    }
  }

  async notify(userId: string, payload: PushPayload, campaign = 'notification'): Promise<void> {
    if (!flags.webPush) return
    try {
      const subs = await prisma.pushSubscription.findMany({ where: { userId } })
      if (subs.length === 0) return

      const enriched = {
        ...payload,
        url: this.buildUrl(payload.url, campaign),
        icon: payload.icon ?? '/icons/icon-192x192.png',
      }

      await Promise.allSettled(
        subs.map((sub) =>
          webpush
            .sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(enriched),
            )
            .catch(async (err: { statusCode?: number }) => {
              // 410 Gone = 구독 만료 → DB에서 자동 삭제
              if (err.statusCode === 410) {
                await prisma.pushSubscription
                  .delete({ where: { endpoint: sub.endpoint } })
                  .catch(() => {})
              }
            }),
        ),
      )
    } catch {
      // 절대 throw 안 함 — 메인 로직에 영향 없음
    }
  }
}

export const pushService = new PushService()
