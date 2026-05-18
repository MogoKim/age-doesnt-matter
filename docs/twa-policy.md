# 우리 나이가 어때서 — TWA 정책 문서

> **용도**: TWA 수정·개선·배포 시 반드시 참조하는 단일 진실의 원천  
> **최초 작성**: 2026-05-18  
> **관리**: Claude Code가 TWA 관련 작업 시 자동 업데이트

---

## 1. 배경 및 목적

### 1-1. 왜 TWA인가

우리 나이가 어때서(이하 우나어)는 PWA(Progressive Web App)로 구축된 웹 서비스다.
TWA(Trusted Web Activity)는 Android 앱 셸이 웹 콘텐츠를 네이티브 앱처럼 구동하는 방식으로,
별도 React Native/Flutter 앱 없이 Google Play Store에 정식 등록이 가능하다.

**선택 근거:**
- 이미 완성된 PWA(sw.js, manifest.json, 아이콘, web-push) 자산 재활용
- 유지보수 단일화: 웹 코드 배포 = 앱 업데이트 (별도 앱 심사 불필요)
- 주소창 없는 전체화면 경험 = 네이티브 앱과 동일한 UX
- 푸시 알림: 이미 구현된 Web Push 그대로 작동

### 1-2. 목표

| 목표 | 지표 |
|------|------|
| Play Store 정식 등록 | 프로덕션 트랙 게시 |
| 네이티브 앱 UX | 주소창 없는 전체화면 확인 |
| 도메인 인증 | assetlinks.json 검증 통과 |
| 푸시 알림 작동 | Web Push 구독 + 수신 확인 |
| 5060 사용자 접근 | Play Store 다운로드 가능 |

---

## 2. 아키텍처 개요

```
사용자 Android 기기
    │
    ▼
[com.agenotmatter.app] ← Google Play Store 배포
    │  TWA 셸 (Bubblewrap 생성)
    │  minSdkVersion: 21 (Android 5.0+)
    │  fallback: Custom Tabs
    │
    ▼ Digital Asset Links 인증 통과 시
[age-doesnt-matter.com] ← Vercel 배포 웹앱
    │  Next.js 14 App Router
    │  Service Worker (/sw.js)
    │  Web Manifest (/manifest.json)
    │
    ├── /.well-known/assetlinks.json  ← 도메인 인증
    ├── /manifest.json                ← PWA 설정
    ├── /sw.js                        ← 오프라인·푸시
    └── /icons/                       ← 앱 아이콘
```

### TWA 작동 원리

1. Android가 앱 실행 시 `assetlinks.json` 검증
2. 검증 성공 → 주소창 없는 전체화면으로 웹앱 로드
3. 검증 실패 → Custom Tabs로 폴백 (주소창 있음)
4. Service Worker가 오프라인·푸시 처리

---

## 3. 핵심 구성 요소 현황

### 3-1. assetlinks.json

**파일 경로**: `public/.well-known/assetlinks.json`  
**서빙 URL**: `https://age-doesnt-matter.com/.well-known/assetlinks.json`  
**Cache-Control**: `no-cache, no-store, must-revalidate` (항상 최신)

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.agenotmatter.app",
    "sha256_cert_fingerprints": [
      "D5:F1:9B:5B:0B:44:1C:CF:33:B9:2B:CE:1F:74:1B:62:E0:20:4F:15:61:9C:F2:C0:31:1F:F3:52:0F:40:FD:20"
    ]
  }
}]
```

**중요**: 이 SHA-256은 **Google Play App Signing** 서명키다.
로컬 `android.keystore`의 SHA-256이 아님. Play Console → 앱 서명 페이지에서 확인.

### 3-2. Web App Manifest

**파일 경로**: `public/manifest.json`

| 필드 | 값 | TWA 필수 여부 |
|------|-----|--------------|
| display | standalone | ✅ 필수 |
| start_url | / | ✅ 필수 |
| id | / | 권장 |
| theme_color | #FF6F61 | 권장 |
| background_color | #FFFFFF | 권장 |
| orientation | portrait-primary | 설정됨 |
| icons (192px maskable) | ✅ | ✅ 필수 |
| icons (512px maskable) | ✅ | ✅ 필수 |

### 3-3. Service Worker

**파일 경로**: `public/sw.js`  
**캐시명**: `unao-v1`

기능:
- 프리캐시: `/`, `/offline`, `/manifest.json`, 아이콘 2종
- 설치 즉시 활성화 (`skipWaiting()`)
- VAPID 키 동적 주입 (`postMessage` 수신)
- Web Push 푸시 알림 수신 처리

**등록 컴포넌트**: `src/components/common/ServiceWorkerRegister.tsx`
- 프로덕션 환경에서만 등록
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`를 SW에 전달

### 3-4. Android TWA 앱

**빌드 도구**: Bubblewrap CLI  
**빌드 결과물 위치**: `/Users/yanadoo/migration-backup/android/`

| 파일 | 용도 |
|------|------|
| `android.keystore` | 로컬 서명 키 (분실 금지) |
| `twa-manifest.json` | Bubblewrap 프로젝트 설정 |
| `app-release-signed.apk` | 직접 설치용 APK |
| `app-release-bundle.aab` | Play Store 업로드용 AAB |

**twa-manifest.json 핵심 설정**:
```json
{
  "packageId": "com.agenotmatter.app",
  "host": "age-doesnt-matter.com",
  "name": "우리 나이가 어때서",
  "launcherName": "우나어",
  "appVersionCode": 2,
  "appVersionName": "2",
  "enableNotifications": true,
  "minSdkVersion": 21,
  "fallbackType": "customtabs"
}
```

### 3-5. Web Push (푸시 알림)

**라이브러리**: `web-push` ^3.6.7

**환경변수**:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # 공개키 (브라우저에 노출)
VAPID_PRIVATE_KEY=               # 비밀키 (서버 전용, 절대 노출 금지)
VAPID_SUBJECT=mailto:korea.age.not.matter@gmail.com
```

**DB 모델**: `PushSubscription`
```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
}
```

**API 라우트**:
- `POST /api/push/subscribe` — 구독 등록 (rate limit: 10/분)
- `DELETE /api/push/subscribe` — 구독 해제

**PWA 상태 추적** (User 모델):
```
pwaInstalled            Boolean  (설치 여부)
pwaInstalledAt          DateTime
pwaPopupShownCount      Int      (팝업 노출 횟수)
pwaPopupLastShownAt     DateTime
pwaBannerDismissCount   Int      (배너 닫기 횟수)
pwaBannerLastDismissAt  DateTime
pwaBannerHiddenUntil    DateTime (배너 숨김 기한)
```

### 3-6. Feature Flags

**파일**: `src/lib/feature-flags.ts`

```typescript
export const flags = {
  webPush: process.env.FEATURE_WEB_PUSH !== 'false',
  pushToast: process.env.FEATURE_PUSH_TOAST !== 'false',
  twa: process.env.FEATURE_TWA !== 'false',
}
```

**Vercel 환경변수로 재배포 없이 즉시 토글 가능.**  
기본값: `true` (환경변수 미설정 시 활성)

---

## 4. 정책

### 4-1. 패키지명 정책

```
com.agenotmatter.app
```

**절대 변경 불가.** Play Store 등록 후 패키지명 변경 = 신규 앱으로 재등록.
기존 사용자 이관 불가능.

### 4-2. 키스토어 정책

| 항목 | 값 |
|------|-----|
| 파일 위치 | `/Users/yanadoo/migration-backup/android/android.keystore` |
| alias | android |
| 역할 | 로컬 서명 (Play Console 업로드 전 서명) |

**중요**: Play App Signing 활성화 상태.
Google이 재서명하므로 **최종 APK 서명 = Google 서명키**.
assetlinks.json의 SHA-256은 Google 서명키 기준.

키스토어 분실 시: Play Console 업로드 자체가 불가능. 반드시 백업 유지.

### 4-3. assetlinks.json 수정 정책

수정이 필요한 경우:
1. Google Play App Signing SHA-256 교체 (재등록 등)
2. 추가 앱 패키지 등록

수정 절차:
1. `public/.well-known/assetlinks.json` 수정
2. 배포 (Vercel 자동 배포)
3. 검증: `curl https://age-doesnt-matter.com/.well-known/assetlinks.json`
4. Google Digital Asset Links API로 확인:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://age-doesnt-matter.com&relation=delegate_permission/common.handle_all_urls`

**절대 캐시 허용 금지**: `Cache-Control: no-cache, no-store, must-revalidate` 유지.

### 4-4. 앱 버전 정책

| 항목 | 현재값 | 규칙 |
|------|--------|------|
| appVersionCode | 2 | 업로드마다 +1 (감소 불가) |
| appVersionName | "2" | 의미있는 버전명 (예: "3", "1.1") |

버전 코드는 **단조 증가**. 같은 버전 코드 재업로드 불가.

### 4-5. AAB 업로드 정책

- Play Console에는 반드시 **AAB** 업로드 (APK 아님)
- AAB: `app-release-bundle.aab`
- 내부 테스트 → 비공개 테스트 → 프로덕션 순서로 트랙 이동

### 4-6. manifest.json 수정 정책

수정 금지 항목 (TWA 파괴):
- `display`: standalone 고정
- `start_url`: / 고정
- `id`: / 고정

수정 가능 항목:
- `icons` 배열에 추가 (기존 삭제 금지)
- `screenshots` 배열 추가/수정
- `categories`, `description` 수정

수정 후 반드시:
1. `npx tsc --noEmit` 통과 확인
2. 프로덕션 manifest.json URL 확인:
   `curl https://age-doesnt-matter.com/manifest.json`

### 4-7. Service Worker 수정 정책

캐시명 (`CACHE_NAME`) 변경 시:
- 기존 캐시 자동 정리 로직 포함 여부 확인
- 변경 전 오프라인 동작 테스트 필수

VAPID 키 변경 시:
- 기존 모든 PushSubscription 무효화됨
- DB에서 전체 삭제 후 재구독 유도 필요
- 변경 절차: 새 키 생성 → .env 업데이트 → 배포 → DB cleanup

### 4-8. Feature Flag 정책

TWA 기능 비활성화 시:
```
FEATURE_TWA=false
FEATURE_WEB_PUSH=false
FEATURE_PUSH_TOAST=false
```

Vercel 대시보드에서 환경변수 수정 → 재배포 없이 즉시 적용.
긴급 롤백 시 사용.

---

## 5. 빌드 및 배포 절차

### 5-1. 신규 TWA 빌드 (버전 업)

```bash
# 1. twa-manifest.json에서 버전 업
# appVersionCode: N → N+1
# appVersionName: "N" → "N+1"

# 2. Bubblewrap으로 빌드
cd /Users/yanadoo/migration-backup/android
bubblewrap build

# 3. 결과물 확인
ls -la *.apk *.aab

# 4. Play Console에 AAB 업로드
# Play Console → 앱 → 내부 테스트 → 새 릴리스
```

### 5-2. assetlinks.json만 변경 시

```bash
# 코드 변경
vi public/.well-known/assetlinks.json

# 배포 (git push → Vercel 자동)
git add public/.well-known/assetlinks.json
git commit -m "fix: assetlinks.json SHA-256 업데이트"
git push

# 검증 (배포 후 1-2분 후)
curl -s https://age-doesnt-matter.com/.well-known/assetlinks.json | python3 -m json.tool
```

### 5-3. VAPID 키 교체 시

```bash
# 1. 새 키 생성
npx web-push generate-vapid-keys

# 2. Vercel 환경변수 업데이트
# NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY

# 3. 기존 PushSubscription 전체 삭제 (Supabase SQL Editor)
DELETE FROM "PushSubscription";

# 4. 배포 후 사용자에게 재구독 팝업 노출
```

---

## 6. 검증 체크리스트

### 6-1. assetlinks.json 검증

```bash
# 파일 응답 확인
curl -I https://age-doesnt-matter.com/.well-known/assetlinks.json
# Cache-Control: no-cache, no-store, must-revalidate 확인

# 내용 확인
curl -s https://age-doesnt-matter.com/.well-known/assetlinks.json

# Google Digital Asset Links API
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://age-doesnt-matter.com&relation=delegate_permission/common.handle_all_urls"
# linked: true 확인
```

### 6-2. TWA 주소창 없음 확인

1. Android 기기에 APK 설치
2. 앱 실행
3. 주소창 없이 전체화면 = TWA 인증 성공
4. 주소창 있음 = assetlinks.json 불일치 (검증 실패)

### 6-3. 푸시 알림 검증

1. 앱 설치 → 로그인
2. 알림 허용 팝업 → 허용
3. DB에 PushSubscription 레코드 생성 확인
4. 테스트 푸시 발송 → 기기 수신 확인

### 6-4. manifest.json 검증

```bash
curl -s https://age-doesnt-matter.com/manifest.json | python3 -m json.tool | grep -E '"display"|"start_url"|"id"'
# "display": "standalone"
# "start_url": "/"
# "id": "/"
```

---

## 7. 트러블슈팅

### 주소창이 없어지지 않는다

원인 및 해결:
1. **assetlinks.json SHA-256 불일치**
   - Play Console → 앱 서명 → Google 서명 인증서 SHA-256 복사
   - `public/.well-known/assetlinks.json` 업데이트 → 배포
2. **assetlinks.json 캐시**
   - `Cache-Control: no-cache` 헤더 확인
   - `curl -I` 로 응답 헤더 검증
3. **패키지명 불일치**
   - assetlinks.json `package_name` vs twa-manifest.json `packageId` 일치 확인

### 푸시 알림이 오지 않는다

1. VAPID 키 불일치: `.env.local`과 Vercel 환경변수 동일 여부 확인
2. PushSubscription 만료: 기기 재구독 필요
3. Feature flag 비활성: `FEATURE_WEB_PUSH=false` 여부 확인
4. Service Worker 미등록: production 환경인지 확인

### Play Console 업로드 거부

1. 버전 코드 중복: `appVersionCode` +1 후 재빌드
2. 서명 불일치: `android.keystore` 동일한 키스토어 사용 확인
3. APK가 아닌 AAB 요구: `app-release-bundle.aab` 업로드

---

## 8. 파일 위치 참조

| 파일 | 경로 |
|------|------|
| assetlinks.json | `public/.well-known/assetlinks.json` |
| manifest.json | `public/manifest.json` |
| Service Worker | `public/sw.js` |
| SW 등록 컴포넌트 | `src/components/common/ServiceWorkerRegister.tsx` |
| Feature Flags | `src/lib/feature-flags.ts` |
| Push 구독 API | `src/app/api/push/subscribe/route.ts` |
| PWA 상태 API | `src/app/api/user/pwa-status/route.ts` |
| next.config.js | `next.config.js` (캐시 헤더) |
| TWA 빌드 설정 | `/Users/yanadoo/migration-backup/android/twa-manifest.json` |
| 키스토어 | `/Users/yanadoo/migration-backup/android/android.keystore` |
| AAB 결과물 | `/Users/yanadoo/migration-backup/android/app-release-bundle.aab` |
| APK 결과물 | `/Users/yanadoo/migration-backup/android/app-release-signed.apk` |

---

## 9. 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2026-05-18 | 최초 작성 — 탐색 기반 전체 현황 문서화 | Claude Code |
