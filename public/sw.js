/// <reference lib="webworker" />

const CACHE_NAME = 'unao-v3'

// VAPID 키 — ServiceWorkerRegister.tsx에서 postMessage로 주입받음
let vapidPublicKey = null
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_VAPID_KEY' && event.data.key) {
    vapidPublicKey = event.data.key
  }
})
// 프리캐시할 정적 리소스
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// 설치: 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// 페치: Network-first (HTML), Cache-first (동일 출처 정적 리소스)
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 타사(cross-origin) 요청은 SW가 인터셉트하지 않음
  // 이유: SW fetch()는 connect-src CSP 적용 대상이며,
  //       t1.kakaocdn.net 등 외부 도메인은 connect-src에 없어 ERR_FAILED 발생
  if (url.origin !== self.location.origin) {
    return
  }

  // API/인증 요청은 캐시하지 않음
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/auth')) {
    return
  }

  // 동일 출처 정적 리소스: Cache-first
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        }).catch(() => {
          // 네트워크 실패 시 캐시 재시도, 없으면 네트워크 에러 응답
          return caches.match(request).then((fallback) => fallback ?? Response.error())
        })
      })
    )
    return
  }

  // HTML 내비게이션(화면 이동): SW가 가로채지 않고 브라우저에 위임(패스스루).
  // 이유: SW가 리다이렉트/오류 응답을 navigation에 반환하면 브라우저가 네이티브 에러로
  //       내비게이션을 실패시킴(로그아웃 후 홈 이동 실패 사례). 이동 안정성 최우선.
  //       정적 리소스는 위 cache-first 블록에서 계속 오프라인 지원됨.
  if (request.mode === 'navigate') {
    return
  }
})

// 푸시 알림 수신
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title || '우나어'
  const options = {
    body: data.body || '새 알림이 있어요',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// 구독 만료 시 자동 재구독 (endpoint 갱신)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    }).then((sub) =>
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
    ).catch(() => {}) // 실패해도 SW 크래시 없음
  )
})

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
