import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { flags } from '@/lib/feature-flags'
import { isFcmConfigured, sendFcmToUser } from './fcm-sender'
import type { PushPayload } from './types'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

function initVapid() {
  if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return false
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  return true
}

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

  async notify(
    userId: string,
    payload: PushPayload,
    campaign = 'notification',
    category: 'service' | 'ad' = 'service',
  ): Promise<void> {
    if (!flags.webPush) return
    try {
      // 광고성(정보통신망법 §50): 마케팅 동의자만 + (광고) 표기 + 야간(21~08 KST) 차단.
      // 서비스 알림(기본 'service', 댓글·답글·등급)은 규제 무관 → 그대로.
      // ※ 채널(FCM/웹푸시) 무관하게 동일 적용하려고 분기보다 앞에 둔다.
      let outgoing = payload
      if (category === 'ad') {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { marketingOptIn: true } })
        if (!user?.marketingOptIn) return                  // ① 미동의자 광고 차단
        const kstHour = (new Date().getUTCHours() + 9) % 24
        if (kstHour >= 21 || kstHour < 8) return            // ③ 야간 21~08 KST 광고 차단
        const title = payload.title.startsWith('(광고)') ? payload.title : `(광고) ${payload.title}`  // ② 표기
        outgoing = { ...payload, title }
      }

      const enrichedUrl = this.buildUrl(outgoing.url, campaign)
      const enriched = {
        ...outgoing,
        url: enrichedUrl,
        icon: outgoing.icon ?? '/icons/icon-192x192.png',
      }

      // ── 배타 분기: 앱(FcmToken 보유) → FCM, 없으면 웹푸시 ──
      // 스키마 주석 정책(schema.prisma FcmToken). 둘 다 보내면 중복 수신 → 한 채널만.
      if (isFcmConfigured()) {
        const fcmCount = await prisma.fcmToken.count({ where: { userId } })
        if (fcmCount > 0) {
          await sendFcmToUser(userId, enriched, enrichedUrl)
          return
        }
      }

      // ── 웹푸시 (VAPID) ──
      if (!initVapid()) return
      const subs = await prisma.pushSubscription.findMany({ where: { userId } })
      if (subs.length === 0) return

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
