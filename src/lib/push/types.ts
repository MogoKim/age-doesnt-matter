export interface PushPayload {
  title: string
  body: string
  url: string       // UTM 자동 삽입됨
  tag?: string      // 중복 알림 방지 (같은 tag = 덮어쓰기)
  icon?: string     // 기본: /icons/icon-192x192.png
}
