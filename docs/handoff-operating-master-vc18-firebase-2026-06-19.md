# Handoff — Operating Master / Android Capacitor / vc18 Firebase

작성일: 2026-06-19 KST  
대상 저장소: `/Users/yanadoo/Documents/New_Claude_agenotmatter`  
현재 로컬 브랜치/HEAD: `poc/ios-capacitor-2-1` / `830978f`  
현재 Play production 최신 앱: `vc17 / 1.0.13`  
핸드오프 목적: 다음 Codex 세션이 바로 운영 판단과 vc18 Firebase 작업을 이어받도록 현재까지의 맥락, 역할, 완료 상태, 남은 작업, 금지사항을 한 문서에 고정한다.

---

## 0. 이 문서를 읽는 다음 세션의 첫 행동

다음 세션은 어떤 작업을 시작하든 아래 순서부터 지켜야 한다.

1. `git status --short`를 먼저 실행한다.
2. 현재 브랜치와 origin/main 상태를 확인한다.
   - `git branch --show-current`
   - `git rev-parse --short HEAD`
   - `git fetch origin`
   - `git log --oneline --decorate -8 origin/main`
3. 이 문서와 아래 문서를 읽는다.
   - `docs/design/vc18-firebase-fcm-analytics.md`
   - `docs/verification-android-oauth-day2-2026-06-18.md`
   - `docs/handoff-codex-operating-master-2026-06-18.md`
4. 현재 작업트리가 많이 dirty이므로 절대 `git add .`를 하지 않는다.
5. vc18 구현은 가능하면 별도 worktree에서 한다.
   - 권장: `git worktree add ../New_Claude_agenotmatter-vc18 origin/main -b vc18/firebase-analytics`
   - 이유: 현재 작업트리에는 사용자/Claude가 만든 미커밋 변경과 untracked 파일이 많다.

---

## 1. Codex의 역할 — 반드시 유지할 운영 원칙

이 프로젝트에서 Codex는 단순 코드 작성자나 리뷰어가 아니다. 창업자와 함께 우나어를 운영하는 **운영 마스터**로 행동해야 한다.

역할은 CTO, CPO, COO 관점을 동시에 갖는 것이다.

- CTO: 기술 구조, 인증, 앱 배포, Firebase/GA4/Ads 연결, 장애 예방을 책임진다.
- CPO: 40대 50대 60대 여성 사용자가 실제로 쓰는 흐름, 로그인/온보딩/글쓰기 경험, 문구와 정책을 본다.
- COO: Play Console, Kakao Developers, Firebase, Vercel, Supabase, GitHub, Claude Code 작업 흐름을 운영 프로세스로 묶는다.

Codex의 판단 0순위는 목적이다.

- "왜 이 일을 하는가?"
- "성공 상태는 무엇인가?"
- "사용자, 운영, 사업 관점에서 반드시 지켜야 할 결과는 무엇인가?"

Codex의 판단 1순위는 AS-IS 확인이다.

- 문서만 믿지 않는다.
- Claude Code 보고만 믿지 않는다.
- 코드, DB 상태, 워크플로우, 실제 화면, 콘솔 상태를 직접 대조한다.

Claude Code와의 관계:

- Claude Code는 빠른 구현자/진단자다.
- Codex는 운영 책임자이자 최종 검증자다.
- Claude Code의 결론을 그대로 받아들이지 말고 근거를 검증한다.
- Claude Code에게 일을 시킬 때는 "read-only 진단", "수정 금지", "확인 파일", "산출물 형식", "금지 영역"을 명시한다.
- 같은 파일을 Claude Code와 Codex가 동시에 수정하지 않는다.

창업자와의 관계:

- 창업자는 외부 콘솔 승인, 실제 폰 테스트, 사업 판단을 한다.
- Codex는 창업자의 판단 피로를 줄여야 한다.
- 창업자가 지금 해야 할 것, 오늘 해야 할 것, 하면 안 되는 것, 설계 뒤 해야 할 것을 분리해 말한다.

운영 문제를 다룰 때 기본 구조:

1. 목적/목표
2. AS-IS
3. 문제정의
4. 원인
5. 해결 원칙
6. 우선순위
7. 구현/검증

---

## 2. 프로젝트 배경

서비스:

- 이름: 우리 나이가 어때서 / 우나어
- 도메인: `age-doesnt-matter.com`
- 앱 패키지: `com.agenotmatter.app`
- 대상: 40대 50대 60대 여성을 중심으로 한 커뮤니티
- 핵심 경험: 카카오 로그인, 글/댓글, 온보딩, 여성 전용 정책, 커뮤니티 체류

기존 운영 구조:

- Next.js 14 App Router 웹
- Android TWA/PWA
- Vercel production
- Supabase + Prisma
- NextAuth v5 + Kakao
- Google Play production에 기존 TWA 앱이 있었음
- 웹 수익은 AdSense/Coupang 기반

Capacitor 전환을 시작한 배경:

1. Android TWA/PWA만으로는 Google App Campaigns(AC)에서 앱 설치, first_open, 가입 완료 같은 native app conversion을 정확히 최적화하기 어렵다.
2. Firebase/GA4/Google Ads로 앱 전환을 정확히 연결하려면 native Android 앱 계층이 필요하다.
3. Capacitor를 쓰면 Android와 iOS를 같은 Next.js 웹 코드 기반으로 운영하면서 native 기능을 붙일 수 있다.
4. 장기적으로 FCM 푸시, 앱 전용 분석, iOS 앱, 앱 수익화 전환 옵션을 확보할 수 있다.

현재 전략:

- 웹은 계속 운영한다.
- Android는 TWA에서 Capacitor shell로 전환했다.
- 앱 안의 AdSense는 현재 OFF다.
- 웹 AdSense/Coupang은 유지한다.
- 앱 수익화는 당장 AdMob으로 가지 않고, 먼저 광고 유입/가입 최적화를 만든다.
- Firebase/GA4/Google Ads 연결이 우선이다.
- Airbridge는 후순위다.
- FCM 푸시는 중요하지만 vc18에서 무리하게 전부 넣지 않는 것이 현재 권장이다.

---

## 3. 지금까지 완료된 큰 작업

### 3-1. Android Capacitor shell

완료:

- Capacitor 기반 Android shell 생성
- `server.url`을 production `https://age-doesnt-matter.com`으로 설정
- Android 앱에서 웹 production을 로드
- 앱 내 광고 OFF 처리
- 웹/TWA에는 광고 영향 없도록 분리

의미:

- 앱 버전은 Play AAB로 배포해야 native 변경이 반영된다.
- 웹 UI/문구/페이지 로직은 Vercel 배포만으로 앱에도 반영된다.
- native 리소스, Gradle, Firebase SDK, permission, Android Manifest, 아이콘, 스플래시 등은 앱 배포가 필요하다.

### 3-2. Kakao OAuth handoff

문제:

- Capacitor WebView 안에서 Kakao OAuth를 그대로 처리하면 세션/쿠키/외부 브라우저 복귀 문제가 생긴다.

해결:

- app-login start/bridge handoff 구조 도입
- HMAC + nonce 1회 consume 방식
- app-handoff credentials provider 추가
- Kakao 로그인 후 앱 딥링크 복귀 처리
- 기존 여성 production 앱 로그인 PASS 확인

이미 해결된 장애:

- `KOE010 invalid_client`: Preview env의 Kakao client secret mismatch
- `AccessDenied`: `signIn` 콜백이 `app-handoff` provider를 막던 문제

현재 판정:

- 기존 여성 로그인: PASS
- AppHandoffToken 발급/consume/session: PASS
- AUTH_FAILURE 급증: 없음
- 신규 여성/남성은 테스트 계정 부재로 실측 미완. 코드상 PASS 가정 + production 모니터링으로 확정 예정.

### 3-3. Android production release

주요 release 이력:

- `vc13 / 1.0.9`: production URL, OAuth handoff 포함
- `vc14`: back button + textZoom + 아이콘 복구 핫픽스
- `vc17 / 1.0.13`: 최종 아이콘/스플래시 리소스 정리

Play production 현재 상태:

- `vc17 / 1.0.13` production live
- 창업자와 가족 폰에서 로그인 정상 확인
- 뒤로가기 동작 정상 확인
- 글씨 크기 정상화 확인
- 아이콘/스플래시 최종 확인 완료

### 3-4. Android UI/native 이슈 해결

이슈 1: 런처 아이콘이 Capacitor 기본 아이콘으로 바뀜

- 원인: `cap add android`가 만든 기본 리소스
- 최종 해결: 점 3개 심볼만 런처 아이콘으로 사용, 안전영역 반영
- 스플래시는 기존 텍스트+심볼 우나어 로고 유지
- 최종 반영: `vc17 / 1.0.13`

이슈 2: Android 기본 뒤로가기 버튼에서 앱 종료가 안 됨

- 원인: Capacitor 기본 WebView history 동작
- 해결: Capacitor `backButton` listener 추가
- 루트/온보딩 등에서는 `App.exitApp()`, 내부 페이지에서는 `history.back()`

이슈 3: 앱 글씨가 웹/TWA보다 크게 보임

- 원인: Android WebView textZoom이 시스템 글꼴 배율을 반영
- 해결: `MainActivity.java`에서 textZoom 100 고정

### 3-5. GitHub PR/merge 이력

중요 보고 기준:

- PR #5: OAuth handoff / app ads off / main merge
- PR #6: production `server.url`, `versionCode 13`
- PR #8: `vc17` launcher icon + splash 리소스 main 반영

Claude Code 보고 기준:

- PR #8 merge 완료
- origin/main 최신 커밋: `68acc37 Merge pull request #8 from MogoKim/poc/ios-capacitor-2-1`
- 포함 커밋: `830978f chore(android): finalize launcher icon and splash assets for vc17`

다음 세션은 이 보고를 그대로 믿지 말고 `git fetch origin && git log --oneline origin/main -8`로 확인해야 한다.

---

## 4. 현재 로컬 작업트리 상태와 주의사항

현재 `git status --short` 기준으로 dirty가 많다.

주의:

- 이 상태에서 `git add .` 금지
- 자동 formatter로 전체 파일 변경 금지
- unrelated dirty를 되돌리지 말 것
- Claude Code 또는 사용자가 만든 변경을 임의로 정리하지 말 것

현재 관측된 주요 dirty/untracked:

- 삭제: `assets/logo.png`
- 수정: community 관련 파일들
  - `src/app/(main)/community/[boardSlug]/[postId]/page.tsx`
  - `src/components/features/community/CommentSection.tsx`
  - `src/components/features/community/GuestCommentInput.tsx`
- untracked: `android/app/google-services.json`
- untracked: 여러 docs/analysis, docs/design, scripts, mockup, iOS workspace 파일

Firebase 작업을 한다면 권장 방식:

- 현재 dirty worktree에서 바로 대규모 구현하지 말고 별도 worktree 사용을 검토한다.
- 새 worktree를 만들기 전 창업자에게 "새 작업 폴더로 vc18 진행하겠다"고 짧게 알린다.
- 그래도 현재 worktree에서 한다면 stage 대상을 파일 단위로 명시한다.

---

## 5. Firebase/GA4/Google Ads의 사업 목적

창업자의 핵심 목적:

- AC 광고를 돌려 40대 50대 60대 여성 가입자를 정확히 늘리고 싶다.
- 단순 설치 수가 아니라 "회원가입 완료"를 전환 목표로 잡고 싶다.
- 남성 유입은 가입 단계에서 차단되므로 광고 최적화가 남성에게 학습되지 않게 해야 한다.

정확한 방향:

- Firebase native Analytics로 앱 first_open/app_open/session/sign_up/onboarding_complete를 수집한다.
- GA4에서 앱 stream과 웹 stream을 한 속성 안에 통합한다.
- Google Ads와 GA4/Firebase를 연결한다.
- Google Ads App Campaign의 conversion goal을 `sign_up` 또는 가입 완료 이벤트로 둔다.
- 가능하면 `sign_up`은 여성 가입 성공 시에만 fire한다.
- 남성 차단은 별도 내부 로그 또는 별도 event로 보되 Ads 최적화 conversion으로 쓰지 않는다.

중요한 판단:

- 내부 운영 데이터는 Supabase/Prisma/BotLog로 자세히 본다.
- GA4/Firebase/Ads는 "광고 최적화와 큰 퍼널" 용도다.
- Airbridge는 나중에 더 정교한 attribution이 필요할 때 붙인다.

---

## 6. Firebase Console 현재 상태

Firebase 프로젝트 생성 완료:

- 프로젝트 이름: `agenotmatter`
- 프로젝트 ID: `agenotmatter-19615`
- 프로젝트 번호: `757616369524`
- 요금제: Spark

Android 앱 등록 완료:

- Android package name: `com.agenotmatter.app`
- Firebase Android app 등록 완료
- `google-services.json` 다운로드 완료
- 로컬 배치 완료: `android/app/google-services.json`

현재 로컬 JSON 검증 결과:

```json
{
  "project_id": "agenotmatter-19615",
  "project_number": "757616369524",
  "package_name": "com.agenotmatter.app"
}
```

주의:

- `google-services.json`은 client config라 서버 secret은 아니다.
- 그래도 전체 내용을 채팅에 붙여 넣거나 공개 이슈에 올리지 않는다.
- Firebase service account JSON은 완전히 다른 민감 파일이다. 절대 repo commit 금지.

Firebase 콘솔에서 Kotlin/Groovy 선택:

- 이 저장소는 Groovy `build.gradle` 구조다.
- Kotlin DSL을 눌렀어도 문제 없다. 단순 안내 화면 선택일 뿐이다.
- 실제 수정은 `android/build.gradle`, `android/app/build.gradle` 기준으로 한다.

현재 Android Gradle 상태:

- `android/build.gradle`에 이미:
  - `classpath 'com.google.gms:google-services:4.4.4'`
- `android/app/build.gradle`에 이미 조건부 apply:
  - `android/app/google-services.json`이 있으면 `com.google.gms.google-services` plugin apply
  - 없으면 빌드 안전하게 pass
- `versionCode 17`
- `versionName "1.0.13"`

즉, Firebase Console 안내의 Gradle plugin 기본 단계는 이미 상당 부분 충족되어 있다.

---

## 7. vc18의 정확한 추천 범위

vc18 목표:

**Firebase native Analytics + Google Ads App Campaign 전환 최적화 기반을 만든다.**

vc18에 포함 권장:

| 항목 | 포함 여부 | 이유 |
| --- | --- | --- |
| Firebase Android native SDK | 포함 | AC 광고 추적 핵심 |
| `google-services.json` | 포함 | Android Firebase app 식별 |
| Firebase Analytics native plugin | 포함 | first_open/app_open/app stream 수집 |
| 앱 실행/세션 기본 이벤트 | 포함 | Firebase 자동 이벤트 기반 |
| Kakao login start event | 포함 | 로그인 퍼널 시작점 |
| Kakao login success event | 포함 | 로그인 전환점 |
| 여성 회원가입 완료 `sign_up` | 포함 | AC 최적화 핵심 conversion |
| onboarding complete | 포함 | 유입 품질 판단 |
| platform/app_version user property | 포함 | 앱/웹 분리와 운영 분석 |
| GA4/Ads 연결 준비 | 포함 | conversion import 목적 |

vc18에서 보류 권장:

| 항목 | 보류 이유 |
| --- | --- |
| FCM full push | 권한 UX, 토큰 저장, 발송 정책, 로그아웃/재설치 정리까지 범위 큼 |
| AdMob | 수익화 정책, 심사, 앱 광고 UX 별도 판단 필요 |
| WebView API for Ads | AdSense 실패 시 검토할 보조 경로 |
| Airbridge | Firebase/GA4/Ads 기본 전환이 먼저 |
| iOS Firebase | Android AC 안정화 뒤 진행 |

주의:

- 기존 설계 문서 `docs/design/vc18-firebase-fcm-analytics.md`에는 FCM token infra까지 포함되어 있다.
- 하지만 창업자와의 대화 기준으로는 FCM은 후순위로 분리하는 것이 더 안전하다.
- 다음 세션은 vc18 구현 전에 범위를 다시 확정해야 한다.

추천 결론:

- `vc18A`: Firebase Analytics + Ads conversion only
- `vc18B`: FCM token infra only, 권한 UX/발송은 없음
- `vc19`: FCM push UX + 발송 + 운영 정책

---

## 8. vc18 구현 예상 파일

구현 전 반드시 실제 코드 경로를 다시 확인한다.

예상 신규/수정 파일:

### Android/native

- `android/app/google-services.json`
- `android/app/build.gradle`
- `android/build.gradle`
- `android/app/src/main/AndroidManifest.xml` 필요 여부 확인
- `android/app/build.gradle` version bump: `vc18 / 1.0.14`

### package/dependency

- `package.json`
- `package-lock.json`

예상 패키지:

- `@capacitor-firebase/app`
- `@capacitor-firebase/analytics`
- 필요 시 나중에 `@capacitor-firebase/messaging`

주의:

- 설치 전 현재 Capacitor 버전과 plugin peer dependency 확인.
- 설계 문서에는 `@capacitor-firebase/analytics@8.3.0` 계열이 언급되어 있으나, 구현 시점에 실제 호환 버전을 확인해야 한다.

### Web/app event wrapper

추정 신규 파일:

- `src/lib/analytics/app-analytics.ts`
- 또는 기존 `src/lib/gtm.ts` 확장

원칙:

- 웹 브라우저/TWA: 기존 `gtag`/web stream
- Capacitor Android: native Firebase Analytics/app stream
- 앱에서 gtag까지 같이 쏘면 web stream에 앱 트래픽이 섞인다. 피해야 한다.

### 이벤트 호출 위치

추정 확인 경로:

- Kakao login start 버튼/라우트
- login success/handoff 완료 위치
- 신규 user create 시점
- onboarding complete server action/client callback

주의:

- `auth.ts`는 인증 핵심 파일이므로 되도록 최소 수정.
- 가입 완료 이벤트를 서버에서 바로 native Firebase로 쏠 수는 없다. 앱 클라이언트가 "가입 완료 상태"를 감지해 native event를 쏘는 구조가 필요할 수 있다.
- 정확한 user create 위치와 onboarding 상태를 먼저 read-only로 추적해야 한다.

---

## 9. 이벤트 설계

기본 원칙:

- Ads optimization conversion은 여성 가입 성공 이벤트만 사용한다.
- 남성 차단은 conversion으로 쓰지 않는다.
- 내부 분석은 DB/BotLog로 계속 본다.

추천 이벤트:

| 이벤트 | 발화 조건 | Ads conversion 후보 | 비고 |
| --- | --- | --- | --- |
| `login_start` | 앱에서 카카오 로그인 버튼 클릭 | 아니오 | 퍼널 시작 |
| `login` | 카카오 로그인 완료 + 세션 확인 | 보조 | 기존 사용자 로그인 포함 가능 |
| `sign_up` | 신규 여성 User 생성 후 앱 세션 확보 | 예 | 핵심 전환 |
| `onboarding_complete` | 닉네임 등 온보딩 완료 | 보조/품질 | 유입 품질 |
| `female_only_blocked` | 남성 차단 화면 도달 | 아니오 | 내부/GA4 분석용만 |

추천 user properties:

- `app_platform=android_app`
- `app_version=1.0.14` 또는 실제 버전
- `auth_provider=kakao`
- 성별은 개인정보/정책을 고려해 event parameter로 과도하게 보내지 않는다. Ads conversion은 여성 성공 이벤트 자체로 분리한다.

---

## 10. 검증 계획

vc18 구현 후 내부 테스트에서 확인:

1. Android build 성공
   - `npx cap sync android`
   - Gradle bundle release
2. Firebase DebugView
   - 앱 실행 시 first_open/app_open 또는 관련 자동 이벤트 관측
   - `login_start`
   - `login`
   - `sign_up`
   - `onboarding_complete`
3. GA4 Realtime
   - Android app stream에 이벤트 유입
   - web stream 오염 없음
4. Google Ads
   - GA4/Firebase conversion import 준비
   - `sign_up` conversion 표시 가능
5. 웹 회귀
   - 기존 웹 GA4 이벤트 계속 동작
   - 웹 카카오 로그인 영향 없음
   - 웹 AdSense/Coupang 영향 없음
6. 앱 회귀
   - 카카오 로그인
   - 홈 진입
   - 글 상세
   - 댓글/글쓰기
   - 뒤로가기
   - 글씨 크기
   - 아이콘/스플래시

검증 명령:

- `npm run typecheck`
- `npm run lint`
- 필요 시 `npm run build`
- Android build
- 가능하면 production 이전 내부 테스트 1회

---

## 11. 앱 배포가 필요한 것과 아닌 것

앱 배포 필요:

- Firebase Android native SDK
- `google-services.json` 포함
- Gradle 변경
- Android Manifest 변경
- Android 권한 추가
- FCM native messaging
- 아이콘/스플래시
- textZoom/MainActivity
- versionCode/versionName

앱 배포 불필요:

- 웹 화면/문구/UI 대부분
- Next.js 페이지 로직
- web GA4 gtag 이벤트
- 서버 API 로직
- Vercel env 변경 후 서버 재배포로 충분한 것

이번 vc18은 native Firebase SDK를 포함하므로 앱 배포가 필요하다.

예상 다음 앱 배포:

- `vc18 / 1.0.14`: Firebase Analytics + Ads conversion 기반
- FCM full push를 분리하면 그 다음 `vc19`가 필요할 수 있다.

---

## 12. 아직 남은 작업

| 우선순위 | 작업 | 상태 | 앱 배포 필요 | 담당/비고 |
| --- | --- | --- | --- | --- |
| P0 | vc18 범위 확정 | 필요 | 아니오 | Codex가 창업자에게 `Analytics only` vs `FCM token 포함` 확인 |
| P0 | 현재 main/브랜치/worktree 정리 | 필요 | 아니오 | dirty 보호. 가능하면 별도 worktree |
| P0 | Firebase Analytics native 구현 | ✅ 완료 (456663e) | 예 | vc18 핵심. 앱 native logEvent + 앱 gtag/web stream 전면 차단 |
| P0 | `sign_up` 여성 가입 완료 이벤트 설계/구현 | ✅ 코드 완료 (실측 대기) | 예/웹 배포 | OnboardingForm 가입 완료 지점. 실측은 트래픽 대기 |
| P0 | Firebase DebugView 검증 | 🟡 부분 완료 | 아니오 | `first_open`/`session_start`/`screen_view`/`login_start`/`login` 수신 확인. `sign_up`/`onboarding_complete`는 신규가입 미실시로 미확인 |
| P0 | Google Ads conversion 연결 | ✅ 완료 | 아니오 | GA4 481670969 ↔ Google Ads 연결 + Android app stream `login`/`sign_up` 전환 import 완료. **실제 전환 수 반영은 트래픽 부족으로 운영 모니터링 대기** |
| P1 | vc18 AAB build/sign/upload/release | ✅ 완료 (1.0.14) | 예 | Play Console production 게시 (versionCode 18) |
| P1 | 신규 여성/남성 production 실데이터 모니터링 | 🟡 계속 (트래픽 부족 대기) | 아니오 | 광고 유입/신규 가입 발생 후 확정 |
| P1 | Play crash/ANR 모니터링 | 계속 | 아니오 | Play Console |
| P2 | FCM push token infra | 보류 | 예 | vc18B 또는 vc19 |
| P2 | FCM 권한 UX/발송 정책 | 보류 | 예 | 별도 제품 판단 필요 |
| P2 | Airbridge | 보류 | 예 | Firebase/Ads 기본 전환 이후 |
| P2 | AdMob/WebView API for Ads | 보류 | 예 | 수익화 정책 판단 후 |
| P2 | iOS Capacitor 재개 | 보류 | 예 | Android 안정화 뒤 |
| P3 | stale docs/stash/untracked 정리 | 보류 | 아니오 | 운영 안정 후 |

---

## 13. 다음 세션에 줄 수 있는 첫 지시문

아래 문구를 새 Codex 세션 시작에 그대로 붙여도 된다.

```text
이 저장소는 /Users/yanadoo/Documents/New_Claude_agenotmatter 이다.
먼저 git status --short, 현재 브랜치, origin/main 최신 커밋을 확인하고
docs/handoff-operating-master-vc18-firebase-2026-06-19.md 와
docs/design/vc18-firebase-fcm-analytics.md 를 읽어라.

너의 역할은 단순 코더가 아니라 우나어 운영 마스터다.
Claude Code 보고를 그대로 믿지 말고 코드/콘솔/문서/실제 상태를 대조해라.
현재 작업트리가 dirty가 많으니 git add . 금지, unrelated 변경 금지.

이번 목표는 vc18 Firebase native Analytics + Google Ads App Campaign 전환 최적화 기반이다.
FCM full push, AdMob, Airbridge는 후순위다.
우선 read-only로 현재 Firebase/Gradle/GA4/gtag/가입 경로를 확인하고
vc18 구현 범위와 변경 파일, 검증 명령을 보고해라.
코드 수정은 그 다음 승인 후 진행한다.
```

---

## 14. Claude Code에게 시킬 read-only 진단 프롬프트

```text
코드 수정 금지. read-only 진단만 해라.

목표: vc18 Firebase native Analytics + Google Ads App Campaign 전환 최적화 구현 전 AS-IS를 확정한다.

확인할 것:
1. 현재 Capacitor/Android 버전과 package.json dependency
2. android/build.gradle, android/app/build.gradle의 google-services 적용 상태
3. android/app/google-services.json 존재 여부와 project_id/package_name만 확인(내용 출력 금지)
4. 기존 GA4/gtag 구현 파일과 sign_up/login 이벤트 발화 위치
5. Kakao login start/complete 경로
6. 신규 여성 User 생성 위치와 onboarding complete 위치
7. 앱/웹 분기 helper(isCapacitor/useAppEnvironment 등)
8. vc18 구현 시 수정해야 할 파일 목록
9. FCM을 이번 배포에서 제외할 때 영향

산출물:
- AS-IS 표
- vc18 최소 구현안
- 수정 파일 후보
- 웹/TWA 회귀 위험
- 검증 명령

금지:
- 코드 수정
- git add/commit
- raw SQL
- secret/google-services.json 전체 출력
- unrelated dirty 파일 접촉
```

---

## 15. Claude Code에게 시킬 구현 프롬프트 예시

read-only 진단과 Codex 검토 뒤에만 사용한다.

```text
vc18 구현 승인.

범위는 Firebase native Analytics + Google Ads conversion 준비까지만이다.
FCM push, AdMob, Airbridge는 제외한다.

구현 원칙:
- 앱(Capacitor Android)은 native Firebase Analytics로만 이벤트 전송
- 웹/TWA는 기존 gtag/web stream 유지
- 앱에서 gtag를 중복 호출해 web stream을 오염시키지 말 것
- sign_up은 신규 여성 가입 성공 시점에만 Ads conversion 후보로 쓸 수 있게 설계
- auth.ts는 가능하면 수정하지 말고, 필요하면 최소 변경 전 먼저 보고
- MainActivity/backButton/icon/splash는 건드리지 말 것
- unrelated dirty 파일 접촉 금지
- git add . 금지

필수 검증:
- npm run typecheck
- npm run lint
- Android build
- Firebase DebugView 확인 절차 문서화

산출물:
- 변경 파일 목록
- 이벤트 발화 위치
- DebugView 검증 방법
- vc18 AAB 빌드/서명/Play 업로드 절차
```

---

## 16. 창업자가 해야 할 외부 콘솔 작업

이미 완료:

- Firebase project 생성
- Android app 등록
- `google-services.json` 다운로드

아직 필요:

1. GA4 속성 연결 상태 확인
   - 기존 GA4 속성 "우리 나이가 어때서"에 Android app stream이 생겼는지 확인
   - 별도 GA4 속성을 만들지 않는 것이 현재 추천
2. Firebase DebugView 테스트 준비
   - vc18 내부 테스트 설치 후 DebugView에서 이벤트 확인
3. Google Ads 연결
   - Firebase/GA4와 Google Ads 연결
   - `sign_up` conversion import
   - AC campaign conversion goal로 가입 완료 이벤트 사용
4. Play Console
   - vc18 내부 테스트 업로드
   - 내부 폰에서 검증
   - production 승급
5. Android vitals
   - crash rate
   - ANR rate

---

## 17. 보안/정책 메모

Kakao client secret:

- 과거 디버깅 중 일부 화면/로그에 노출된 이력이 있다.
- GitHub에 커밋된 것은 아니라고 판단되어 창업자가 재발급 없이 진행하기로 결정했다.
- 나중에 여유가 있으면 rotation 권장. 단 지금 vc18의 blocker는 아니다.

Firebase:

- `google-services.json`은 서버 secret이 아니다.
- commit 가능 범주로 볼 수 있다.
- 그러나 채팅/이슈/문서에 전체 내용을 붙이지 않는다.
- Firebase Admin service account JSON은 절대 commit 금지. Vercel env로만 관리한다.

Raw SQL:

- 이 저장소 운영 원칙상 Raw SQL 금지.
- DB 확인은 Prisma client, Supabase Console UI, 기존 운영 도구를 사용한다.

---

## 18. 현재 판정

- Android Capacitor production 전환은 완료됐다.
- **`vc18 / 1.0.14`가 production live다.** (vc17/1.0.13에서 승급)
- 가족 폰 실기기 기준 로그인, 뒤로가기, 글씨 크기, 아이콘/스플래시 문제는 해결됐다.
- Firebase project와 Android app 등록은 끝났다.
- `google-services.json`은 로컬에 들어와 있고, vc18 AAB에 `google_app_id` 주입까지 확인됐다.
- **vc18 Firebase native Analytics + Google Ads App Campaign 전환 기반은 구축 완료.** Android app stream `login`/`sign_up` 전환 import까지 끝났고, 남은 것은 트래픽 누적에 따른 실측·운영 모니터링이다. (§21 참고)

---

## 19. 무슨 의미인가

이제 우나어는 단순 웹/TWA 앱에서 한 단계 넘어와서, Android native app layer를 가진 상태다.

따라서 앞으로는:

- 웹 수정은 Vercel 배포로 빠르게 반영 가능
- native 기능은 앱 버전 배포 필요
- Google Ads AC 최적화는 Firebase native Analytics 이벤트를 통해 훨씬 정확해질 수 있음
- 광고 집행 전 `sign_up` 이벤트를 제대로 설계하는 것이 핵심

---

## 20. 창업자가 지금 할 일

1. 다음 세션을 새로 열고 이 문서 경로를 알려준다.
2. Firebase Console은 그대로 둔다. 지금 더 누르지 않아도 된다.
3. vc18 범위를 결정한다.
   - 추천: Analytics + Ads conversion only
   - FCM push는 다음 버전으로 분리
4. vc18 내부 테스트용 폰을 준비한다.
   - 창업자 Android 폰 1대면 초기 DebugView 확인은 가능

---

## 21. 다음 Codex/Claude Code가 할 일

1. 작업트리/브랜치 상태 확인
2. 별도 worktree 여부 결정
3. Firebase/GA4/gtag/가입 경로 read-only 진단
4. vc18 구현 범위 재확정
5. Firebase native Analytics 구현
6. DebugView에서 이벤트 확인
7. vc18 AAB build/sign/internal test
8. production 승급
9. Google Ads conversion 연결

---

## 22. 남은 작업 우선순위

P0:

- vc18 범위 확정
- Firebase native Analytics 구현
- `sign_up` 전환 이벤트 정확화
- DebugView/GA4 확인

P1:

- Google Ads conversion import
- vc18 production release
- 광고 소액 집행 전 최종 체크

---

## 23. vc18 완료 정리 (2026-06-19)

> vc18 Firebase native Analytics + Google Ads 전환 연결 작업의 최종 상태. §12 표·§18 판정과 일치.

### ✅ 완료
- **Firebase native Analytics 구현** (커밋 456663e): 앱(Capacitor)에서 `login_start`/`login`/`sign_up`/`onboarding_complete`를 GA4 Android app stream(481670969)에 native logEvent. 앱 gtag/web stream은 전면 차단(web stream 오염 0), 웹/TWA는 기존 gtag 유지(회귀 0).
- **vc18 production 게시**: versionName 1.0.14 / versionCode 18, Play Store production live. AAB에 `google_app_id` 주입 확인.
- **Google Ads 전환 연결**: GA4 481670969 ↔ Google Ads 연결 완료 + Android app stream `login`/`sign_up` 전환 import 완료.
- **DebugView 1차 검증**: `first_open`/`session_start`/`screen_view`/`login_start`/`login` 수신 확인.

### 🟡 운영 모니터링 대기 (트래픽 부족)
- **`sign_up`/`onboarding_complete` 실측**: 신규 가입 테스트 미실시로 native 수신 미확인. 코드 분기는 존재.
- **Google Ads 실제 전환 수 반영**: 연결·import는 완료됐으나, 전환 수 집계는 **트래픽 부족으로 운영 모니터링 대기**.
- **신규 여성/남성 production 실데이터**: 유입/신규 가입 발생 후 확정.

### ⛔ 광고 집행 보류
- **광고 집행은 `sign_up` 실측 확인 또는 유입 캠페인 착수 전까지 보류한다.**
- 사유: 전환 이벤트(`sign_up`)가 실데이터로 한 번도 검증되지 않은 상태에서 광고를 집행하면 AC 최적화가 잘못된 신호로 학습될 수 있다. 최소 신규 가입 1건의 `sign_up` native 수신 확인 후 집행을 권장.

P2:

- FCM push
- Airbridge
- AdMob/WebView API for Ads
- iOS

P3:

- 문서 정리
- untracked/stash 정리
- 오래된 handoff stale 표시

