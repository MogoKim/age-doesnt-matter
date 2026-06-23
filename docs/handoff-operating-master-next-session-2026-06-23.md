# Handoff — Operating Master / vc20 FCM / AdMob / Ads / iOS / Magazine Boundary

작성일: 2026-06-23  
대상 저장소: `/Users/yanadoo/Documents/New_Claude_agenotmatter`  
서비스: 우리 나이가 어때서 / 우나어  
도메인: `https://age-doesnt-matter.com`  
현재 기준 브랜치: `poc/admob-test`  
현재 기준 HEAD: `d70c15c feat(magazine): add keyword queue selector dry-run`  
현재 기준 origin/main: `af9fd11 chore(android): align vc20 Play release metadata`

---

## 0. 이 문서의 목적

이 문서는 다음 세션이 바로 이어서 운영 판단과 작업을 시작하도록 만든 통합 핸드오프다.

이번 세션에서는 Android Capacitor 전환 이후 다음 핵심 작업들이 동시에 진행됐다.

- Android 앱 성능 개선
- GA4/Firebase native Analytics 및 Google Ads 전환 구조 안정화
- AdMob 도입 준비 및 app-ads.txt 배포
- FCM 앱 푸시 토큰 수집 및 서버 발송 production 검증
- Play Console vc20 AAB 업로드 및 출시 진행
- 매거진 SEO 키워드 엔진 설계·수집·큐 selector dry-run
- `/auth/error` 카카오 OAuth 노이즈 분석 종료
- FCM/Analytics Capacitor proxy thenable 버그 수정

다음 세션은 이 문서를 먼저 읽고, 기억이나 이전 보고만 믿지 말고 `git status`, `origin/main`, Play/Vercel/AdMob 상태를 다시 확인한 뒤 진행해야 한다.

---

## 1. Codex의 역할 — 운영 마스터

이 프로젝트에서 Codex는 단순 코더나 리뷰어가 아니다. Codex는 창업자와 함께 우리 나이가 어때서를 운영하는 **운영 마스터**다.

역할은 다음 관점이 합쳐진다.

- CTO: 기술 구조, 배포, 앱/WebView, Firebase, GA4, Push, Ads, DB, 보안, 회귀 방지 책임
- CPO: 50대 60대 사용자의 첫 경험, 가입 전환, 리텐션, 알림 UX, 광고 노출 경험 책임
- COO: 운영 프로세스, 스케줄러, 에이전트, DB write 정책, Play/Vercel 배포 순서, 장애 재발 방지 책임

Codex의 판단 순서는 반드시 다음이다.

1. 목적/목표: 이 작업이 왜 필요한가, 성공 상태는 무엇인가
2. AS-IS: 현재 코드·DB·콘솔·실기기·워크플로우가 실제로 어떻게 움직이는가
3. 문제정의: 증상과 원인을 분리한다
4. 해결 원칙: 사용자 경험, 운영 안정성, 사업 목표를 동시에 맞춘다
5. 우선순위: 지금 해야 할 것과 나중에 할 것을 나눈다
6. 구현/검증: 변경 범위를 좁히고 실제 명령·실기기·콘솔로 확인한다

Claude Code 보고서는 그대로 믿지 않는다. 특히 다음은 직접 대조해야 한다.

- 코드 경로
- DB 상태
- Play Console 상태
- Vercel production 상태
- Firebase/GA4/AdMob 콘솔 상태
- launchd/GitHub Actions/cron 실행 경로
- 실기기 logcat 및 실제 UI

중요 운영 원칙:

- `git add .` 금지
- force push 금지
- 전체 branch merge 금지
- dirty worktree 보존
- Raw SQL 직접 실행 금지
- Supabase DB write는 창업자 승인/COO 원칙
- 같은 파일을 Claude Code와 Codex가 동시에 수정하지 않음
- `poc/admob-test` 전체를 main에 올리면 안 됨. 섞인 커밋이 많아서 selective cherry-pick/worktree 방식만 사용

---

## 2. 프로젝트 배경과 현재 목표

서비스 목표:

- 50대 60대 한국인 여성 중심 커뮤니티와 정보/일자리 플랫폼을 성장시킨다.
- Android 앱 전환으로 가입 전환, GA4/Ads 전환 측정, 푸시 리텐션, 앱 수익화 기반을 만든다.
- 매거진 SEO를 제대로 설계해 검색 유입을 장기 성장 채널로 만든다.

현재 최상위 사업 목표:

1. Android 앱 사용자가 빠르게 가입하고 홈에 도달한다.
2. 가입 신호(`sign_up`, `onboarding_complete`)가 GA4/Firebase/Ads에서 유실되지 않는다.
3. Google Ads AC는 광고 유입 기준으로 판단한다. 친구 직접 설치/가입은 Ads 전환에 잡히지 않는 것이 정상이다.
4. 리텐션을 위해 앱 FCM 푸시를 먼저 완성한다.
5. AdMob은 app-ads.txt/app readiness 대기 후 실제 광고 코드 반영을 판단한다.
6. 매거진은 기존 자동발행을 망가뜨리지 않고, 키워드 큐 기반 하루 2편 체계로 전환한다.
7. iOS는 Android 안정화 이후 별도 트랙으로 진행한다.

브랜드/표현 원칙:

- 금지 표현은 제품 문구에 쓰지 않는다.
- 권장 표현: `우리 또래`, `50대 60대`, `인생 2막`
- 터치 타겟 52px 이상, 본문 17px 이상, 가능하면 18px
- 브랜드 컬러: `#FF6F61`

---

## 3. 현재 git 상태와 절대 주의

현재 세션 시작 시 확인한 상태:

```text
## poc/admob-test...origin/poc/admob-test [ahead 5]
 D assets/logo.png
 M src/app/(main)/community/[boardSlug]/[postId]/page.tsx
 M src/components/features/community/CommentSection.tsx
 M src/components/features/community/GuestCommentInput.tsx
?? agents/scripts/_audit-app-installs.mjs
?? agents/scripts/_audit-coldstart.mjs
?? agents/scripts/_audit-hero.mjs
?? agents/scripts/_audit-signup.mjs
?? agents/scripts/_gen-favicon.mjs
?? docs/analysis/...
?? docs/design/vc18-firebase-fcm-analytics.md
?? docs/handoff-...
?? ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/
?? mockup/
?? scripts/ga4-gcpc-names.ts
?? scripts/ga4-scroll-check.ts
?? scripts/ga4-utm-inflow.ts
```

이 dirty 상태는 대부분 다른 세션 또는 이전 작업 산출물이다. 다음 세션은 반드시 다시 `git status --short --branch`부터 확인한다.

절대 금지:

- dirty 파일 정리 명목으로 삭제/되돌리기 금지
- `assets/logo.png` 삭제 상태를 임의 복구/커밋 금지
- community 3파일 수정분 건드리지 않기
- untracked docs/scripts/mockup/iOS 파일 임의 포함 금지
- `poc/admob-test` 전체 main merge 금지

현재 `poc/admob-test`는 이름과 달리 AdMob, 매거진, 문서 커밋이 섞여 있다. main 반영은 다음 방식만 안전하다.

```bash
git fetch origin
git worktree add --detach ../tmp-main origin/main
cd ../tmp-main
git cherry-pick <필요한 커밋만>
npm run typecheck
npm run lint
npm run build
git push origin HEAD:main
```

---

## 4. 현재 main/production 요약

현재 `origin/main`:

```text
af9fd11 chore(android): align vc20 Play release metadata
```

주요 main 반영 이력:

- `1ee6849` — 온보딩 닉네임 입력 리렌더 감소
- `db4288b` — 홈 첫 렌더 비필수 작업 defer
- `44aff43` — Android Capacitor AAB 운영 정책 문서 추가
- `5aea664` — `public/app-ads.txt` production 반영
- `33f6a97` — Android FCM 토큰 등록 MVP
- `bf7b2a9` — FCM 등록 thenable 버그 수정
- `8f91c1f` — native Analytics thenable 버그 수정
- `701ecf0` — FCM 서버 발송 구현
- `af9fd11` — vc20 Play release metadata 정렬

Vercel production:

- FCM 서버 발송 코드 포함
- Analytics thenable 수정 포함
- app-ads.txt 서빙 중
- 앱은 `server.url = age-doesnt-matter.com` 구조라, 웹 번들 수정은 AAB 재빌드 없이 앱에 반영된다.

단, native plugin/Manifest/build.gradle 변경은 AAB 재빌드와 Play 업로드가 필요하다.

---

## 5. 완료된 주요 작업

### 5.1 Android 앱 성능

완료:

- 온보딩 닉네임 입력 리렌더 감소
- `handleComplete`의 `sign_up` / `onboarding_complete` await 순서 보존
- 홈 진입 직후 비필수 작업 defer
  - popup fetch
  - notification badge first fetch
  - signup push toast

검증:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Vercel production Ready
- 실기기에서 홈 진입이 “아주 빠르고 좋음”으로 확인됨

중요:

- 이 작업들은 `src/` 웹 변경이므로 AAB 재빌드 불필요였다.

### 5.2 GA4 / Firebase Analytics / Google Ads

완료:

- Android Capacitor 앱에서 native Firebase/GA4 Analytics 사용
- 앱 WebView 내 `gtag` 차단 유지
- `sign_up` 및 `onboarding_complete`는 onboarding 완료 후 native 이벤트 await 후 홈 이동
- Google Ads 전환 import 구조 잡힘
- 직접 설치/가입은 Ads 전환이 아닌 것이 정상이라고 정리

중요 버그 수정:

- `src/lib/analytics/app-analytics.ts`에서 Capacitor plugin proxy를 Promise 해석값으로 반환하던 thenable 버그 수정
- 커밋: `8f91c1f fix(analytics): avoid Capacitor proxy thenable resolution`
- AAB 재빌드 불필요. Vercel production 배포만으로 앱에 반영됨

남은 확인:

- 실기기 logcat에서 `FirebaseAnalytics.then() is not implemented` 에러가 사라졌는지 확인하면 좋다.
- GA4 DebugView/Realtime에서 `sign_up`, `onboarding_complete` 지속 모니터링.

### 5.3 `/auth/error` 카카오 OAuth 노이즈

완료:

- read-only 분석과 운영 모니터링 종료
- 원인: 카카오 OAuth callback에서 간헐 `oauth_callback_error` 발생 후 `/auth/error`가 잠깐 보이고, 앱이 재시도 후 로그인 성공
- 테스트 제외 baseline:
  - 최근 24h: 2건, 모두 handoff 성공
  - 최근 3일: 8건, 모두 handoff 성공
  - 실사용 실패로 끝난 케이스 0
- 가입 및 `sign_up` 신호와 무관으로 확정

판정:

- 패치 불필요
- 모니터링 유지
- 향후 실사용에서 handoff 성공 없이 실패 반복 시에만 UX 우회 검토

### 5.4 FCM 앱 푸시 — 토큰 수집부터 서버 발송까지 완료

목표:

- 앱 사용자에게 native FCM 푸시를 보낼 수 있게 하여 리텐션 기반을 만든다.

완료된 것:

- `FcmToken` DB 테이블 생성
- RLS enabled 확인
- Android 앱 native FCM token 수집
- 서버 API로 token 저장
- Firebase Admin SDK env 등록
- 서버 FCM 발송 구현
- 기존 웹푸시(VAPID)와 FCM 배타 분기
- 앱 전용 유저도 broadcast 수신 대상에 포함
- 무효 FCM token 자동 정리
- production에서 실제 기기 알림 표시 확인

핵심 커밋:

- `33f6a97 feat(push): add native FCM token registration for Android app`
- `bf7b2a9 fix(push): avoid Capacitor plugin proxy as promise value in FCM register`
- `701ecf0 feat(push): FCM server-side dispatch via firebase-admin`

DB 상태:

- `FcmToken` table 존재
- columns: `id`, `userId`, `token`, `platform`, `createdAt`, `updatedAt`
- indexes: pkey, token unique, userId index
- FK: `FcmToken_userId_fkey` → `User`
- RLS: `true`

운영 검증:

- 본인 userId 대상 service push 1건 발송
- Firebase Admin `successCount=1`, `failureCount=0`
- Galaxy Note10 알림 트레이에 21:14 FCM 알림 표시됨

주의:

- private key는 절대 출력하지 않는다.
- Firebase Admin JSON을 repo에 복사하거나 commit하지 않는다.
- `.env.local`은 gitignore 대상이며, Vercel Production env도 등록 완료된 상태다.

남은 FCM 후속:

- 포그라운드 수신 표시
- 알림 탭 시 `data.url` 딥링크 라우팅
- 앱이 foreground일 때 UX
- push permission UX를 기존 문구형 토스트와 더 부드럽게 연결할지 검토

### 5.5 Play Console / Android vc20

상태:

- vc20 AAB 업로드 및 production release 진행 중
- 화면상 `20 (1.0.15)` release가 검토/게시 흐름에 있음
- 출시 노트:
  - 우리 또래가 더 편하게 만날 수 있도록 앱을 조금 더 다듬었어요.
  - 오늘도 좋은 이야기 나눠요 :)

중요 이슈:

- Play가 AD_ID 권한/선언 관련 오류를 표시했었다.
- 이후 `af9fd11 chore(android): align vc20 Play release metadata`가 main에 반영됨.
- 다음 세션은 Play Console에서 vc20 검토/게시 상태와 오류 해소 여부를 다시 확인해야 한다.

운영 의미:

- FCM native token 수집은 vc20 AAB가 사용자에게 배포되어야 일반 사용자에게 작동한다.
- 서버 발송은 이미 production 코드가 있으나, 기존 vc18 사용자에게는 native messaging plugin이 없으므로 token 수집이 안 된다.
- vc20이 배포되고 사용자가 업데이트해야 `FcmToken`이 증가한다.

### 5.6 AdMob

현재 확보된 값:

- AdMob App ID: `ca-app-pub-4117999106913048~8809650070`
- Android banner ad unit ID: `ca-app-pub-4117999106913048/3137309547`
- Publisher ID: `pub-4117999106913048`

완료:

- 테스트 배너 MVP preview 검증 PASS
- 실제 광고 ID 전환 커밋은 `poc/admob-test`에 존재
- `public/app-ads.txt`만 main에 먼저 반영
- production URL:
  - `https://age-doesnt-matter.com/app-ads.txt`
  - 내용: `google.com, pub-4117999106913048, DIRECT, f08c47fec0942fa0`
  - HTTP 200 확인
  - www → non-www redirect 후 200 확인
  - robots.txt 차단 없음

AdMob 콘솔 상태:

- 도메인 URL 변경 감지까지 최대 7일 걸릴 수 있다는 공식 안내가 화면에 표시됨
- “아직 app-ads.txt가 포함된 광고 요청 없음”은 신규 상태에서 정상
- 지금은 대기 상태가 맞다.

중요:

- 실제 AdMob 코드(`AdMobBanner`, strings App ID, Manifest meta-data, package plugin 등)는 아직 main에 정식 반영하지 말아야 한다.
- `poc/admob-test`에 있는 AdMob 커밋은 vc19 기반이었다. 현재 main은 vc20 흐름이므로, 나중에 AdMob을 진행할 때는 반드시 `origin/main` 기준 새 worktree에서 재적용하고 versionCode를 vc21 이상으로 올려야 한다.
- 테스트 ID는 production에 올리지 않는다.
- app readiness/app-ads.txt 검증 전에는 AdMob production 반영 보류.

### 5.7 매거진 SEO 키워드 엔진

이번 세션에서 매거진은 계속 진행 중이며, 다른 세션은 되도록 매거진 파일을 건드리지 않는다.

완료된 커밋 on `poc/admob-test`:

- `2721004 docs(magazine): define SEO keyword engine transition plan`
- `9ae157a feat(magazine): add local SEO keyword research tools`
- `5a8ff30 feat(magazine): add local SEO keyword universe tools`
- `d70c15c feat(magazine): add keyword queue selector dry-run`

현재 매거진 AS-IS:

```text
launchd morning(12:00) + late(14:00)
  → agents/cafe/local-magazine-runner.ts
  → agents/cafe/magazine-generator.ts main()
```

살아있는 자동발행 경로는 launchd 2개뿐이다. GHA magazine cron은 비활성, `agents/cron/schedules.yaml`의 magazine 항목은 stale에 가깝다.

중요 설계 원칙:

- 새 발행 경로를 만들지 않는다.
- 기존 `magazine-generator.ts` 내부 입력만 keyword queue로 교체한다.
- 기존 CafeTrend/geo/욕망지도는 삭제하지 않고 fallback으로 강등한다.
- 중복가드 유지:
  - `isSimilarTitle`
  - `isDuplicateAllTime`
  - SEO title duplicate
  - unique slug
- post category는 cluster가 아니라 기존 `detectCategory(title)`를 유지한다.
- 하루 2편: morning 1, late 1
- no_publish 계열은 raw에는 보관하지만 발행 큐에는 절대 들어가지 않는다.

현재 keyword queue dry-run:

- publishable universe 약 1,188개
- 14일치 28슬롯 미리보기 생성
- no_publish 누출 0
- 클러스터 균형 유지
- 인접 동일 클러스터 반복 0
- 7일 내 동일 subtopicKey 반복 0
- generator 연결은 아직 안 함
- 게시글 생성 0
- DB write 0
- launchd/cron 변경 0

다음 매거진 작업:

1. `keyword-queue.ts`를 generator에 연결하는 설계/구현
2. `magazine-generator.ts`에서 queue를 입력 1순위로 추가
3. maxArticles 3 → 2
4. 세션별 1편 제한
5. 발행 성공 후 state 파일에 소비 기록
6. 실패/중복 스킵 시 다음 후보로 넘어가는 처리
7. dry-run → staging/smoke → 실제 하루 2편 관찰

매거진 main 반영은 아직 하지 않는다. 우선 현재 세션에서 계속 진행한다.

### 5.8 iOS

아직 시작하지 않았다.

남은 큰 트랙:

- Capacitor iOS 프로젝트 구성
- Apple Developer / App Store Connect 준비
- Kakao redirect URI iOS 대응
- Firebase iOS 앱 / APNs / FCM iOS
- iOS WebView 정책 검토
- iOS push/analytics/ads 분리
- App Store 심사 대응

iOS는 Android vc20/FCM/AdMob/매거진이 안정화된 뒤 별도 계획으로 진행하는 것이 안전하다.

---

## 6. 현재 남은 업무 우선순위

### P0 — Play vc20 상태 확인

왜 중요한가:

- FCM native token 수집은 vc20 AAB가 배포되어야 일반 사용자에게 작동한다.
- Play 오류가 남아 있으면 배포가 막힌다.

다음 세션에서 할 일:

- Play Console > 게시 개요 / 최신 버전 및 번들 확인
- vc20 `20 (1.0.15)` 상태 확인
- AD_ID 선언 오류가 사라졌는지 확인
- 출시가 승인/게시됐는지 확인
- 출시 후 설치/업데이트 수와 crash/ANR 모니터링

### P1 — FCM 운영 모니터링

해야 할 일:

- `FcmToken` row 증가 확인
- 앱 업데이트 후 실제 사용자 token 수집 여부 확인
- 어드민 즉시/예약 푸시가 FCM/WebPush 배타 분기되는지 확인
- 광고성 push는 기존 marketingOptIn/야간 제한/표기 게이트 준수

후속 구현:

- foreground notification 표시
- notification action/tap → `data.url` 라우팅
- 토스트형 권한 안내 UX 개선

### P2 — AdMob 대기 및 재판정

현재는 대기:

- app-ads.txt production OK
- Play 개발자 웹사이트 URL OK
- AdMob이 도메인 변경 감지 및 app-ads.txt 크롤링하는 데 최대 7일 안내

다음 확인:

- AdMob app-ads.txt 탭 상태
- app readiness 승인
- 실제 ad request 발생 여부

주의:

- AdMob real code를 지금 main에 올리지 않는다.
- 나중에 진행 시 vc21 이상 새 버전으로 진행.

### P3 — GA4 / Ads AC 모니터링

해야 할 일:

- GA4 Realtime/DebugView에서 `sign_up`, `onboarding_complete` 지속 확인
- Google Ads AC는 실제 광고 유입 기준으로만 판단
- direct install/signup과 Ads conversion을 혼동하지 않기
- 앱 gtag 차단 회귀 없는지 확인

### P4 — 매거진 키워드 큐 generator 연결

이 세션에서 계속 진행할 수 있는 업무.

할 일:

- generator 연결 설계 확정
- 최소 수정으로 queue 입력 추가
- launchd/cron 새 경로 생성 금지
- 하루 2편, 세션별 1편
- 14일 dry-run과 실제 발행 후보 검수

### P5 — iOS 계획

Android가 안정화된 뒤 별도 문서/트랙으로 시작.

---

## 7. 절대 건드리지 말아야 할 것

다음 세션에서 특별한 지시 없이 건드리지 않는다.

- `src/app/(main)/community/[boardSlug]/[postId]/page.tsx`
- `src/components/features/community/CommentSection.tsx`
- `src/components/features/community/GuestCommentInput.tsx`
- `assets/logo.png` 삭제 상태
- `mockup/`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`
- 기존 untracked docs/handoff 문서들
- agents/scripts audit 파일들
- AdMob real code를 포함한 `poc/admob-test` 전체
- 매거진 generator 연결 전 launchd plist
- `.github/workflows/agents-daily.yml` magazine cron
- `agents/cron/schedules.yaml` stale 항목

---

## 8. 다음 세션 첫 메시지 권장 프롬프트

다음 세션을 열 때 아래를 그대로 전달하면 된다.

```text
docs/handoff-operating-master-next-session-2026-06-23.md 문서를 먼저 끝까지 읽어라.

너의 역할은 단순 코더가 아니라 우리 나이가 어때서 운영 마스터다.
CTO/CPO/COO 관점으로 목적, AS-IS, 문제정의, 원인, 해결 원칙, 우선순위, 구현/검증 순서로 판단해라.

먼저 git status --short --branch, git log --oneline -10, origin/main 최신 상태를 확인해라.
dirty worktree는 절대 건드리지 마라. git add . 금지, force push 금지, 전체 branch merge 금지.

현재 중요한 큰 축은:
1. Play vc20 출시 상태 확인
2. FCM token/발송 운영 모니터링 및 foreground/deeplink 후속
3. AdMob app-ads.txt/app readiness 대기
4. GA4/Ads AC sign_up 모니터링
5. iOS 별도 계획

매거진 작업은 다른 세션에서 이어갈 예정이면 건드리지 마라.
만약 매거진 세션이면 keyword queue generator 연결만 진행하고, launchd/cron 새 경로를 만들지 마라.
```

---

## 9. Claude Code에게 줄 수 있는 read-only 프롬프트

### 9.1 Play vc20 상태 확인

```text
read-only로 Play vc20 상태를 점검해줘.

금지:
- 코드 수정 금지
- 커밋 금지
- Play 조작 금지
- git add . 금지
- dirty 파일 미접촉

확인:
1. 현재 origin/main 최신 커밋과 android/app/build.gradle versionCode/versionName
2. AndroidManifest에 AD_ID 권한 포함 여부
3. Play Console 화면 기준 vc20(1.0.15) 검토/게시/오류 상태
4. vc20 출시가 FCM native token 수집에 왜 필요한지
5. 다음 액션이 대기인지 수정인지 판정

결과만 보고하고 수정하지 마.
```

### 9.2 FCM 운영 모니터링

```text
read-only로 FCM 운영 상태를 점검해줘.

금지:
- DB write 금지
- 코드 수정 금지
- 커밋 금지
- token 전체값 출력 금지
- private_key 출력 금지

확인:
1. FcmToken row count, 최근 createdAt, platform 분포
2. vc20 배포 이후 token 증가 여부
3. pushService.notify의 FCM/WebPush 배타 분기 유지 여부
4. 광고성 푸시 게이트가 FCM에도 적용되는지
5. 무효 토큰 정리 로직 존재 여부
6. foreground/deeplink 미구현 후속 정리

결과만 보고하고 수정하지 마.
```

### 9.3 AdMob 대기 상태 확인

```text
read-only로 AdMob 상태를 점검해줘.

금지:
- AdMob 코드 main 반영 금지
- AAB 빌드 금지
- Play 조작 금지
- 커밋 금지

확인:
1. age-doesnt-matter.com/app-ads.txt HTTP 200 및 exact content
2. www redirect 후 app-ads.txt 접근 여부
3. robots.txt에서 Google-adstxt 차단 여부
4. Play Console 개발자 웹사이트 URL
5. AdMob app-ads.txt/app readiness 화면 상태
6. 지금 해야 할 일이 대기인지, 코드 반영인지 판정

결과만 보고해.
```

### 9.4 매거진 generator 연결 전 read-only 점검

```text
read-only로 매거진 keyword queue generator 연결 전 상태를 점검해줘.

금지:
- generator 수정 금지
- launchd/cron/workflow 수정 금지
- DB write 금지
- 게시글 생성 금지
- 커밋 금지

확인:
1. 현재 살아있는 매거진 실행 경로
2. keyword-universe / keyword-queue selector 상태
3. no_publish 누출 여부
4. 14일 dry-run 결과 요약
5. generator 연결 시 필요한 최소 수정 파일
6. 기존 중복가드 유지 방법
7. 하루 2편, 세션별 1편 구현 방식

결과만 보고해.
```

---

## 10. 다음 세션에서 바로 확인할 명령

```bash
git status --short --branch
git log --oneline --decorate --all -25
git rev-parse origin/main
git show --stat --oneline origin/main
```

FCM 코드 확인:

```bash
rg -n "FcmToken|sendFcmToUser|firebase-admin|isFcmConfigured|fcmTokens" src prisma package.json
```

AdMob 상태 확인:

```bash
curl -i https://age-doesnt-matter.com/app-ads.txt
curl -i https://www.age-doesnt-matter.com/app-ads.txt
curl -i https://age-doesnt-matter.com/robots.txt
```

매거진 상태 확인:

```bash
rg -n "keyword-queue|keyword-universe|publishPolicy|SESSION_TIME|maxArticles|isSimilarTitle|isDuplicateAllTime" agents
```

주의: DB나 Play 조작은 명령으로 바로 하지 말고 창업자 승인 후 진행.

---

## 11. 현재 판정

현재 큰 판정은 다음과 같다.

- Android 성능: 완료, production 반영, 실기기 체감 개선 확인
- GA4 native Analytics: 구조 완료, thenable 버그 수정, production 반영
- Ads AC: 구조 완료, 실제 광고 유입 기준으로만 판단
- `/auth/error`: 실사용 기준 패치 불필요, 종료
- FCM: token 수집 + 서버 발송 + 실기기 표시까지 production PASS
- Play vc20: 업로드/출시 진행 중, 다음 세션에서 상태 확인 필요
- AdMob: app-ads.txt production OK, 콘솔 크롤/심사 대기
- 매거진: keyword queue selector dry-run 완료, generator 연결 전
- iOS: 미착수, 별도 트랙 필요

다음 세션의 가장 중요한 태도:

1. 기억보다 현재 상태를 확인한다.
2. 섞인 브랜치를 통째로 밀지 않는다.
3. 앱/WebView 구조상 웹 배포와 AAB 재빌드 필요 여부를 매번 구분한다.
4. 리텐션 목표에서는 FCM이 AdMob보다 우선이다.
5. AdMob은 대기 중이며, 조급하게 실제 광고 코드 반영하지 않는다.
6. 매거진은 검색 유입 장기 성장 작업이며, 자동발행 경로를 새로 만들지 않는다.

