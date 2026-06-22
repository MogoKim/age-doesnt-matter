import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { prisma } from '@/lib/prisma'
import type { PushPayload } from './types'

/**
 * 앱(Capacitor) FCM 서버 발송 — firebase-admin 기반.
 *
 * 웹푸시(service.ts, VAPID)와 별개 채널. 발송 분기는 service.ts notify()에서:
 * 같은 userId에 FcmToken 있으면 FCM(여기), 없으면 웹푸시. (배타 — 중복 발송 방지)
 *
 * service account 키는 .env.local / Vercel(FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY).
 * PRIVATE_KEY는 env에 `\n` literal로 저장 → 사용 직전 실제 개행으로 복원.
 *
 * ⚠️ 수신측(앱) 계약: notification payload는 백그라운드/종료 시 OS가 트레이 자동 표시.
 * 포그라운드 표시 + 탭 딥링크(data.url)는 클라이언트 핸들러(notificationActionPerformed) 필요 — 후속.
 */

let cachedApp: App | null = null

export function isFcmConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  )
}

function getApp(): App | null {
  if (cachedApp) return cachedApp
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) return null
  cachedApp = getApps()[0] ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
  return cachedApp
}

/**
 * userId의 모든 FCM 토큰으로 발송. 무효 토큰(미등록/유효하지않음)은 DB에서 정리.
 * 발송 성공 토큰 수 반환. 미설정/토큰없음/실패 시 throw 안 하고 0 반환.
 */
export async function sendFcmToUser(userId: string, payload: PushPayload, url: string): Promise<number> {
  const app = getApp()
  if (!app) return 0

  const rows = await prisma.fcmToken.findMany({ where: { userId }, select: { token: true } })
  if (rows.length === 0) return 0
  const tokens = rows.map((r) => r.token)

  try {
    const res = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: { url, tag: payload.tag ?? 'notification' },
      android: { priority: 'high', notification: { sound: 'default' } },
    })

    // 무효 토큰 정리 (registration-token-not-registered / invalid-argument)
    const invalid: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalid.push(tokens[i])
        }
      }
    })
    if (invalid.length > 0) {
      await prisma.fcmToken.deleteMany({ where: { token: { in: invalid } } }).catch(() => {})
    }

    return res.successCount
  } catch {
    // 발송 실패가 메인 로직(웹푸시 폴백 없음 — 이 유저는 앱 채널)을 막지 않는다
    return 0
  }
}
