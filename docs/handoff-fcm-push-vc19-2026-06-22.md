# 핸드오프 — FCM 앱 푸시 MVP (vc19)

작성: 2026-06-22. 도구 직렬화 깨짐으로 세션 교체. 이 문서로 누락 없이 이어갈 수 있게 작성.

## 0. 세션 주의
- 이전 세션에서 도구 호출이 간헐 깨짐(raw XML 노출). 원인 추정: 셸 특수변수/긴 파이프/glob/긴 콘텐츠.
- 대응: 명령과 Write를 짧고 단순하게. 한 번에 한 동작.
- 작업은 worktree 격리라 메인 repo dirty와 안 섞임.

## 1. 목표
리텐션 우선순위로 FCM을 AdMob보다 먼저. Android Capacitor 앱에 native FCM push 수신 MVP.
- AdMob은 app-ads.txt 크롤 대기/보류 → 안 건드림.
- FCM은 Play 최신(vc18/1.0.14) 다음 = vc19/1.0.15.
- origin/main 기준 clean worktree에서 진행.

### 금지 (유효)
- AdMob 코드 포함 금지 / 매거진 키워드 / community dirty 파일 수정 금지
- git add 점 금지(파일명 명시) / raw SQL 금지 / Play 업로드 금지 / 서명 금지 / main push 금지
- 실기기 푸시 발송은 별도 승인 후

## 2. 현재 상태 = 코드 구현 + 전체 검증 완료 / 미커밋
- Worktree: /Users/yanadoo/Documents/unaeo-fcm-vc19
- 브랜치: poc/fcm-push-vc19 (base origin/main 5aea664)
- 심링크: .env, .env.local 메인 repo 연결
- node_modules: worktree 자체 설치(독립, messaging 포함)
- 상태: 전부 미커밋. 커밋 승인 대기였음.

### 검증 (전부 PASS)
- tsc 0 / eslint 0 / npm run build SUCCESS / prisma generate OK
- cap sync: messaging 8.3.0 인식(5 plugins)
- gradlew assembleDebug: BUILD SUCCESSFUL 16s (JDK21)

## 3. 변경 파일 (11개)

### 신규 4
- src/lib/push/fcm-register.ts — 앱 native 클라이언트. registerFcmToken(권한+getToken+서버저장), listenFcmTokenRefresh(토큰회전 재저장), unregisterFcmToken(로그아웃용). 웹/TWA no-op, 동적 import.
- src/app/api/push/fcm-token/route.ts — POST(auth+rate-limit+fcmToken.upsert by token, 204) / DELETE(deleteMany by token+userId, 204). 마케팅동의 기록 안 함.
- src/components/features/push/AppFcmRegister.tsx — useAppSession authenticated + isAppNative + 세션1회 + 2.5s 후 등록. 루트 마운트.
- prisma/migrations/20260622000000_add_fcm_token/migration.sql — FcmToken 테이블. DB 미적용(파일만).

### 수정 7
- prisma/schema.prisma — FcmToken 모델(token unique, platform, userId Cascade, index userId) + User에 fcmTokens 역참조.
- src/app/layout.tsx — AppFcmRegister dynamic ssr false import + AppDeepLinkHandler 옆 마운트.
- android/app/src/main/AndroidManifest.xml — POST_NOTIFICATIONS 권한.
- android/app/build.gradle — versionCode 18 to 19, versionName 1.0.14 to 1.0.15.
- package.json + package-lock.json — capacitor-firebase/messaging 8.3.0.
- android/app/capacitor.build.gradle + android/capacitor.settings.gradle — cap sync 자동생성. 손대지 말 것.

(src/generated/prisma는 gitignore라 status 미표시 정상)

## 4. 다음 단계

### STEP A — 커밋 (창업자 승인 후)
worktree에서 파일명 명시 stage(git add 점 금지). 12개 파일:
src/lib/push/fcm-register.ts, src/app/api/push/fcm-token/route.ts,
src/components/features/push/AppFcmRegister.tsx,
prisma/migrations/20260622000000_add_fcm_token/migration.sql,
prisma/schema.prisma, src/app/layout.tsx,
android/app/src/main/AndroidManifest.xml, android/app/build.gradle,
android/app/capacitor.build.gradle, android/capacitor.settings.gradle,
package.json, package-lock.json
- 커밋 메시지: feat(push) add native FCM token registration for Android app vc19
- main push 금지. 브랜치 poc/fcm-push-vc19에 커밋만. main 반영은 별도 승인+cherry-pick.

### STEP B — 창업자 외부 액션 (출시 전 전제)
1. DB migration 적용: prisma migrate deploy (또는 Supabase 콘솔에서 FcmToken 생성). 미적용 시 token 저장 API 500. 로컬 pooler 인증 실패 이력은 Vercel/CI 또는 콘솔에서 적용.
2. production AAB 서명 + Play 업로드 vc19 — 별도 승인 시. keystore: /Users/yanadoo/migration-backup/android/android.keystore, alias android. signingConfig 없음 → bundleRelease unsigned → jarsigner 필요. 비번 채팅 요구 금지.

### STEP C — 서버 FCM 발송 (별도 승인, MVP 밖)
- 신규 src/lib/push/fcm.ts: Firebase Admin SDK로 FcmToken 발송.
- dispatch-scheduled/route.ts 확장: VAPID(웹)+FCM(앱) 이중발송 분기.
- 중복방지: 같은 userId에 FcmToken 있으면 FCM 우선, 없으면 웹푸시. 광고성은 service.ts처럼 marketingOptIn+야간차단 재사용.
- Firebase Admin service account 필요(Vercel env, project agenotmatter-19615). 현재 .env.local GOOGLE_INDEXING service account가 FCM 권한 있는지 확인, 없으면 신규 발급. commit 금지.

### STEP D — 실기기 검증 (별도 승인)
- vc19 설치 → 권한 허용 → FcmToken DB 저장 확인 → 발송 1발 수신.
- 환경: JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home, ANDROID_HOME=/Users/yanadoo/.bubblewrap/android_sdk.

## 5. 검증된 사실 (재진단 불필요)
- google-services.json 이미 존재(agenotmatter-19615 재사용). 수집 단계 추가 env 0.
- 웹푸시 인프라(PushSubscription/ScheduledPush/sw.js/admin push) 완비. 앱 WebView만 웹푸시 미지원이라 FCM 신규.
- API: requestPermissions/checkPermissions 가 receive(PermissionState), getToken 이 token, deleteToken, addListener tokenReceived/notificationReceived.

## 6. AdMob 병행 현황 (보류, 건드리지 말 것)
- 브랜치 poc/admob-test 가 메인 repo 현재 브랜치. 실제 배너 코드 f257818 커밋됨, main 미반영.
- public/app-ads.txt만 main 반영(5aea664). 내용: google.com, pub-4117999106913048, DIRECT, f08c47fec0942fa0.
- 상태: AdMob 앱 인증 확인 불가 = 크롤링 지연(최대 7일). 서버측(파일/도메인/스토어 노출/robots/형식) 전부 정상, 고칠 것 없음.
- 버전 충돌 주의: AdMob도 vc19였음. FCM 우선이라 FCM=vc19. AdMob은 추후 vc20으로 올려야 함.

## 7. 빠른 재개 체크
- git worktree list 로 unaeo-fcm-vc19 poc/fcm-push-vc19 확인
- 그 경로에서 git status --short 로 11개 변경 확인
- 미커밋이므로 worktree 삭제 금지. 커밋 전까지 보존.
- 완료 후 메모리 pending_founder_actions.md에 STEP B 기록 권장.

## 8. 한 줄 요약
FCM 앱 푸시 MVP(토큰 수집) 코드+native 구현 완료, 6종 검증 PASS, worktree poc/fcm-push-vc19에 미커밋. 다음은 커밋 승인, DB migrate deploy(창업자), AAB 서명/Play(승인), 서버 발송 구현(별도). AdMob과 완전 분리, vc19.

## 9. 실기기 검증 결과 (2026-06-22) — 토큰 저장 실패, 근본원인 확정
- 기기: Galaxy Note10 SM-N971N, Android 12. APK 설치 Success, 앱 실행 crash 없음, 카카오 로그인 성공(딥링크 app://auth?token 수신 확인).
- 결과: FcmToken DB row 0 -> 0 (DB 직접조회). 토큰 저장 안 됨.
- 권한 팝업: 안 뜸 = 정상(Android 12는 알림권한 기본허용, POST_NOTIFICATIONS 런타임 팝업은 13+).
- native FCM 플러그인은 APK에 포함되어 tokenReceived 이벤트는 발생(토큰 발급 자체는 됨).

### 근본 원인
- capacitor.config.ts: server.url = https://age-doesnt-matter.com → 앱 WebView가 프로덕션 웹사이트를 로드.
- FCM 웹코드(AppFcmRegister, fcm-register.ts)는 poc/fcm-push-vc19 브랜치에만 있고 프로덕션 미배포.
- 따라서 앱이 띄운 프로덕션 번들에 등록코드 없음 → registerFcmToken 미실행 → POST 없음 → DB 0.
- (config 주석에도 "production 도메인 직접로드 금지: PoC 코드 미포함" 명시되어 있음)

### 실기기 검증을 끝내려면 (셋 중 1 — 창업자 검토 중)
- A. Preview URL: poc/fcm-push-vc19 Vercel Preview 배포 → capacitor.config.ts server.url을 Preview URL로 변경 → APK 재빌드/재설치. (브랜치 push 필요, main/서명 불필요)
- B. 프로덕션 배포: poc→main 병합+배포 후 현재 APK로 검증. (main push 필요 = 현재 금지)
- C. 로컬 dev server: npm run dev + server.url을 맥 LAN IP로 → APK 재빌드. (같은 wifi)

### 검증 방법 (배포 후 재사용) — token값 출력 금지
- Supabase SQL: SELECT id,"userId",platform,"createdAt" FROM "FcmToken" ORDER BY "createdAt" DESC LIMIT 5;
- count: SELECT count(*) FROM "FcmToken"; (0 → 1 기대)
- 이번 로그인 userId 예시: cmqeyjney000h04k0cg1sj24p

### 상태
- vc19 코드/커밋(33f6a97)/DB 마이그레이션(FcmToken, RLS true, count0) 전부 정상.
- 막힌 것 = 앱이 로드하는 웹에 FCM 코드 없음(배포/구성). WAIT: 창업자 A/B/C 결정 대기.

## 10. 옵션 A (Preview URL 검증) 시도 결과 (2026-06-22) — Kakao 로그인 막힘
- 브랜치 poc/fcm-push-vc19 origin push 완료(main 아님). Vercel Preview 자동 빌드.
- Preview URL: https://age-doesnt-matter-341jxi2dl-mogoyongseok-8318s-projects.vercel.app (HTTP 200 공개 접근 OK)
- capacitor.config.ts server.url을 Preview로 임시 변경 → cap sync → assembleDebug(BUILD SUCCESSFUL) → 실기기 재설치(Success) → 앱 실행.
- 카카오 로그인 시도 → 실패: KOE101 "앱 관리자 설정 오류(잘못된 앱 키)".
- 검증 후 server.url을 production(age-doesnt-matter.com)으로 복원 + cap sync 완료. worktree clean(임시변경 0, 미커밋).

### KOE101 원인 (분석)
- NextAuth v5 Kakao OAuth는 KAKAO client_id + redirect_uri={origin}/api/auth/callback/kakao 사용.
- Preview 배포는 (a) Kakao env(client_id)가 Vercel Production scope에만 있어 Preview에 미주입이거나, (b) Preview origin의 redirect_uri가 Kakao 콘솔 화이트리스트에 없음.
- 게다가 Vercel preview URL은 배포마다 hash가 바뀌어 redirect_uri 화이트리스트가 실용적이지 않음.
- 결론: Preview URL로 실기기 로그인 검증은 외부 콘솔 설정(Vercel env + Kakao redirect_uri) 없이는 불가.

### 남은 선택지 (창업자 결정)
- B. production 배포: poc→main 병합+배포 후 현재 production-config APK로 검증. (main push 필요)
- A'. 안정적 preview alias + Kakao 설정: 고정 도메인(예: staging.age-doesnt-matter.com) Vercel alias 지정 → Kakao redirect_uri 등록 → Vercel preview env에 KAKAO 키 주입. (외부 콘솔 작업 다수)
- C. 로컬 dev server + 맥 LAN IP: 마찬가지로 Kakao redirect_uri에 그 IP origin 등록 필요.

### 상태
- 코드/커밋(33f6a97)/DB 마이그레이션/Preview 빌드까지 정상. FCM 토큰 저장 end-to-end 검증만 Kakao 로그인 환경 때문에 미완.
- WAIT: 창업자가 B 또는 A'/C 중 택1 + 필요한 외부 콘솔 설정.

## 11. 옵션 B 진행 + 런타임 버그 발견·수정 (2026-06-22) — 다음 세션 인계

### 지금까지 된 것
- main fast-forward push 완료: origin/main = 33f6a97 (FCM 본체 12파일). AdMob/매거진/community 없음.
- Vercel production 배포 Ready: age-doesnt-matter.com에 FCM 코드 반영됨.
- production-config debug APK 재빌드+설치 → 앱 실행 → 카카오 로그인 성공(딥링크 수신). crash 없음.
- 그러나 FcmToken DB 여전히 0. logcat에서 런타임 에러 발견.

### 발견한 런타임 버그 (근본원인 확정)
- logcat: "FirebaseMessaging.then() is not implemented on android" (등록 시점 ~로그인+2.5s).
- 원인: fcm-register.ts의 getFcmClient가 import(...).then(({FirebaseMessaging}) => FirebaseMessaging)로 Capacitor 플러그인 프록시를 Promise 해석값으로 반환. 프록시는 모든 프로퍼티(then 포함)를 네이티브 호출로 라우팅 → Promise 머신이 thenable로 보고 proxy.then() 호출 → 네이티브 "not implemented" throw → registerFcmToken catch → 'error' → POST 미호출 → DB 0.
- 확정근거: 동일 패턴 src/lib/analytics/app-analytics.ts도 "FirebaseAnalytics.then() is not implemented" 동일 에러(유사구현 비교).

### 수정 (커밋 완료, main 미반영)
- 커밋 bf7b2a9 (branch poc/fcm-push-vc19, worktree /Users/yanadoo/Documents/unaeo-fcm-vc19).
- 변경: src/lib/push/fcm-register.ts 1개만. getFcmClient 헬퍼 제거, 각 함수에서 const { FirebaseMessaging } = await import('@capacitor-firebase/messaging') 로 직접 사용(네임스페이스는 thenable 아님 → 안전).
- bf7b2a9 부모 = 33f6a97 = origin/main → fast-forward 가능.
- pre-commit tsc+eslint 통과. tsc --noEmit 통과 확인.
- ⚠️ bf7b2a9는 origin에 미push 상태(로컬 worktree에만). 창업자가 "bf7b2a9 main 반영 승인" 함.

### 다음 세션이 할 일 (옵션 B 마무리)
1. diff 확인: git -C /Users/yanadoo/Documents/unaeo-fcm-vc19 diff --name-only 33f6a97 bf7b2a9 → src/lib/push/fcm-register.ts 1개만이어야 함.
2. (선택) npm run build 로컬 확인.
3. main ff push: git -C /Users/yanadoo/Documents/unaeo-fcm-vc19 push origin bf7b2a9:main  (force 금지, 파이프 없이)
4. Vercel production Ready 확인: cd worktree && npx vercel ls --yes --environment production | head -5 (최신이 Ready 될 때까지)
5. APK 재빌드(config 이미 production): cd worktree/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/yanadoo/.bubblewrap/android_sdk ./gradlew assembleDebug
6. 설치: /Users/yanadoo/.bubblewrap/android_sdk/platform-tools/adb install -r worktree/android/app/build/outputs/apk/debug/app-debug.apk
7. logcat -c → 앱 실행(monkey) → 창업자 카카오 로그인 → 5초 대기.
8. DB 확인(아래 스크립트) → FcmToken 0→1 기대. token 전체값 출력 금지(id/userId/platform/createdAt만).
9. logcat에서 "FirebaseMessaging.then()" 에러가 사라졌는지 확인.

### DB 검증 스크립트 (임시, 커밋 금지) — 새 prisma-client provider라 tsx 필수
- 파일 _verify-fcm.ts (worktree 루트), 실행: cd worktree && npx tsx _verify-fcm.ts
- 핵심: dotenv(.env.local) + pg Pool(DATABASE_URL 파싱, ssl rejectUnauthorized:false, 6543 pooler) + PrismaPg(adapter) + PrismaClient from './src/generated/prisma/client'
- prisma.fcmToken.count() + findMany(select id/userId/platform/createdAt, take 5)
- 로컬 직접연결(5432)은 IPv6 전용이라 실패 → 반드시 pooler URL(DATABASE_URL) 사용.

### 환경 상수
- 기기: Galaxy Note10 SM-N971N, Android 12 (POST_NOTIFICATIONS 런타임 팝업 없음=정상, 기본허용).
- 패키지: com.agenotmatter.app. adb: /Users/yanadoo/.bubblewrap/android_sdk/platform-tools/adb
- capacitor.config.ts server.url = https://age-doesnt-matter.com (복원됨, clean).
- 로그인 userId 예시(이전): cmqeyjney000h04k0cg1sj24p

### 남은 별도 권장(이번 범위 밖)
- app-analytics.ts 동일 버그 → 앱 GA4 이벤트 일부 유실. fcm-register와 같은 방식으로 수정 권장.

### 세션 운영 주의 (재확인)
- 이 IDE는 도구 호출 직렬화가 자주 깨짐(raw XML 노출). 명령은 짧게, 파이프/특수문자/glob 회피. 한 메시지 한 호출.
