# Handoff — Operating Master / vc20 FCM / AdMob / Ads / iOS / Magazine Boundary

작성일: 2026-06-23 KST  
작성 목적: 현재 긴 세션의 핵심 운영 맥락을 새 세션으로 안전하게 넘긴다.  
중요 원칙: **이 세션은 매거진 SEO 작업을 계속 진행한다. 새 세션은 매거진을 건드리지 말고, Android vc20/FCM/AdMob/Ads/iOS 등 다른 중요 업무를 이어받는다.**

---

## 0. 다음 세션 첫 메시지

아래 내용을 새 세션 첫 메시지로 그대로 붙여넣으면 된다.

```text
이 문서를 먼저 끝까지 읽고 시작해라.
docs/handoff-operating-master-critical-work-2026-06-23.md

너의 역할은 단순 코더가 아니라 우리 나이가 어때서 운영 마스터다.
CTO/CPO/COO 관점으로 목적, AS-IS, 운영 리스크, 사용자 경험, 배포 안전성을 함께 책임진다.

현재 긴 세션은 매거진 SEO 키워드 엔진 작업을 계속 진행한다.
너는 매거진 파일을 건드리지 말고, 그 외 핵심 운영 업무를 담당한다.

작업 시작 전에 반드시:
1. git status --short
2. 현재 브랜치
3. origin/main 최신 커밋
4. Play Console vc20 상태
5. Vercel production 최신 배포 상태
를 확인해라.

절대 git add . 하지 말 것.
기존 dirty 파일과 매거진 진행 파일을 건드리지 말 것.
전체 poc/admob-test 브랜치를 main에 merge하지 말 것.
필요하면 origin/main 기준 임시 worktree에서 단일 목적 커밋만 작업해라.

우선순위:
1. Android vc20 Play 심사/배포 상태 확인 및 FCM rollout 모니터링
2. FCM 앱 알림 클라이언트 후속: foreground 표시, 알림 탭 딥링크
3. AdMob app-ads.txt/app readiness 대기 및 다음 판단
4. GA4/Google Ads AC 전환 모니터링
5. iOS Capacitor 전환 계획 수립
```

---

## 1. Codex의 정확한 역할

이 프로젝트에서 Codex는 단순한 코드 작성자가 아니다. **우리 나이가 어때서 운영 마스터**다.

Codex는 다음 관점으로 판단해야 한다.

- CTO: 기술 구조, 배포 안전성, 데이터 무결성, 보안, 회귀 방지 책임
- CPO: 50대 60대 사용자의 실제 경험, 온보딩, 알림, 광고, 콘텐츠 품질 책임
- COO: 운영 프로세스, 스케줄러, 에이전트, 배포 절차, 수동 콘솔 작업, 재발 방지 책임

판단 순서는 항상 아래다.

1. 목적과 성공 상태를 먼저 확정한다.
2. AS-IS를 코드, DB, 콘솔, 워크플로우, 실제 화면으로 나눠 확인한다.
3. Claude Code나 사용자의 보고를 그대로 믿지 말고 근거를 검증한다.
4. 문제를 source, queue, policy, data, workflow, UX로 분리한다.
5. 급한 패치보다 근본 원인과 운영 안전성을 우선한다.
6. 창업자가 결정해야 하는 지점만 좁혀서 묻는다.

다음 세션의 운영 원칙:

- `git status --short` 없이 작업 시작 금지
- dirty worktree 보존
- `git add .` 금지
- force push 금지
- 전체 poc 브랜치 merge 금지
- Raw SQL은 원칙 금지. 단 창업자가 Supabase 콘솔에서 직접 실행한 migration처럼 명시된 예외는 별도 기록
- 같은 파일을 Claude Code와 Codex가 동시에 수정하지 않음
- 문서, 코드, DB, Play, Vercel, Firebase, AdMob, GA4를 서로 다른 진실의 원천으로 보고 교차 확인

---

## 2. 프로젝트 배경과 목표

서비스: 우리 나이가 어때서 / 우나어  
도메인: `age-doesnt-matter.com`  
대상: 한국 50대 60대 여성 중심 커뮤니티 + 일자리/정보 플랫폼  
기술: Next.js 14 App Router, TypeScript strict, Supabase, Prisma, NextAuth v5 Kakao, Capacitor Android  
Firebase 프로젝트: `agenotmatter-19615`  
GA4: `481670969`  
Android package: `com.agenotmatter.app`

현재 최고 목표는 **리텐션 개선**이다.

우선순위는 다음처럼 해석한다.

1. 앱 로그인/온보딩/홈 진입이 빠르고 안정적이어야 한다.
2. 가입 이벤트와 광고 전환 측정이 유실되지 않아야 한다.
3. 앱 사용자에게 푸시를 보낼 수 있어야 한다.
4. 광고 수익화는 하되, 앱 첫 경험과 정책 안정성을 해치면 안 된다.
5. 매거진은 장기 SEO 자산으로 재설계하되, 지금 별도 세션에서 진행 중이다.
6. iOS는 Android 안정화 후 별도 트랙으로 간다.

---

## 3. 현재 Git / 브랜치 / Dirty 상태

이 문서 작성 시점의 확인값:

- 현재 작업 브랜치: `poc/admob-test`
- 현재 HEAD: `5a8ff30 feat(magazine): add local SEO keyword universe tools`
- `origin/poc/admob-test`: `2c85293 feat(android): add AdMob test banner MVP`
- `origin/main`: `af9fd11 chore(android): align vc20 Play release metadata`

`origin/main` 최근 중요 커밋:

```text
af9fd11 chore(android): align vc20 Play release metadata
701ecf0 feat(push): FCM server-side dispatch via firebase-admin
8f91c1f fix(analytics): avoid Capacitor proxy thenable resolution
bf7b2a9 fix(push): avoid Capacitor plugin proxy as promise value in FCM register
33f6a97 feat(push): add native FCM token registration for Android app
5aea664 chore(ads): add app-ads.txt for AdMob
44aff43 docs(android): add Capacitor AAB operating policy
db4288b perf(home): defer non-critical startup work
1ee6849 perf(onboarding): reduce nickname input re-renders
4490b61 perf(onboarding): reduce native signup transition stutter
2f724c7 fix(analytics): await native signup events before onboarding redirect
```

현재 작업트리에는 다른 세션/기존 작업 dirty가 있다. 새 세션은 이것들을 건드리면 안 된다.

대표 dirty:

```text
D assets/logo.png
M src/app/(main)/community/[boardSlug]/[postId]/page.tsx
M src/components/features/community/CommentSection.tsx
M src/components/features/community/GuestCommentInput.tsx
?? agents/scripts/*
?? docs/analysis/*
?? docs/handoff-*
?? ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/
?? mockup/
?? scripts/ga4-*
```

매거진 진행 파일도 현재 세션 소유로 봐야 한다. 새 세션에서 수정 금지.

```text
agents/magazine/keyword-research/autocomplete-collector.ts
agents/magazine/keyword-research/gsc-nearmiss.ts
agents/magazine/keyword-research/scorer.ts
```

안전한 작업 방식:

```bash
git fetch origin
git worktree add --detach /tmp/unaeo-critical origin/main
cd /tmp/unaeo-critical
```

새 세션에서 main 반영 작업은 가급적 origin/main 기준 임시 worktree에서 수행한다.

---

## 4. 운영 구조 요약

Android 앱은 Capacitor 앱이지만, 핵심 화면은 production 웹을 로드한다.

```text
Android Capacitor shell
  -> server.url = https://age-doesnt-matter.com
  -> Vercel production Next.js 앱 로드
```

따라서:

- 웹 코드만 바뀌면 Vercel 배포로 앱에 반영된다. AAB 재빌드 불필요.
- native plugin, AndroidManifest, Gradle, versionCode가 바뀌면 AAB 재빌드와 Play 업로드 필요.
- Play Console에 올라간 AAB는 네이티브 껍데기와 권한/플러그인을 담고, 실제 UI/웹 로직 상당 부분은 Vercel에서 온다.

중요한 분리:

| 변경 유형 | 반영 방식 |
|---|---|
| Next.js src 웹 로직 | main push -> Vercel production |
| Capacitor plugin 추가 | AAB 재빌드 + Play 업로드 |
| AndroidManifest 권한 | AAB 재빌드 + Play 업로드 |
| DB schema | Prisma migration 또는 Supabase 콘솔 |
| Firebase Admin env | Vercel Production env |
| AdMob app-ads.txt | Vercel production file |

---

## 5. 완료된 핵심 작업

### 5.1 Android 앱 성능

완료:

- `1ee6849` 온보딩 닉네임 입력 리렌더 최적화
- `db4288b` 홈 첫 렌더 비필수 작업 defer
- 사용자 실기기 확인: Android 홈 진입이 매우 빠르고 좋음

의미:

- 광고보다 먼저 앱 첫 경험 속도를 안정화했다.
- 50대 60대 사용자가 가입 직후 이탈할 가능성을 줄였다.

### 5.2 가입/분석/전환 측정

완료:

- native GA4 Analytics 구조 반영
- 앱 gtag 차단 유지
- `sign_up`, `onboarding_complete` native event await 보장
- `2f724c7`, `4490b61`, `8f91c1f` 계열로 가입 이벤트 유실 리스크 감소

중요 정정:

- Google Ads 전환은 광고 유입 기준이다.
- 친구가 직접 설치/가입한 것은 Ads 전환에 안 잡히는 것이 정상이다.
- GA4 실시간/DebugView sign_up과 Ads 전환은 같은 의미가 아니다.

### 5.3 `/auth/error`

완료:

- Kakao OAuth 중 간헐 `oauth_callback_error` 분석
- 테스트 제외 baseline에서 실사용 실패로 끝나는 케이스 없음
- 대부분 handoff 성공으로 로그인 완료
- 패치 불필요, 모니터링 종료

재검토 조건:

- 실사용 신규 가입에서 handoff 성공 없이 `/auth/error`로 끝나는 케이스가 반복될 때만 재검토

### 5.4 FCM 앱 푸시

완료:

- FCM token 수집
- DB `FcmToken` 테이블 생성 및 RLS enabled
- Android native FCM plugin 적용
- FCM server dispatch via Firebase Admin
- production end-to-end 검증

자세한 내용은 6장.

### 5.5 AdMob 준비

완료:

- AdMob 계정 앱 생성
- Android banner ad unit 생성
- `app-ads.txt` production 배포
- Play 개발자 웹사이트 URL 확인
- AdMob app-ads 크롤 대기 상태 확인

자세한 내용은 7장.

---

## 6. FCM 현재 상태

### 6.1 왜 FCM이 중요했나

리텐션이 최우선 목표다. 앱 사용자가 다시 돌아오게 하려면 앱 푸시가 필요하다.

기존 웹 푸시는 Web Push API/VAPID 기반이라 브라우저/PWA에는 가능하지만, Capacitor Android WebView 앱 사용자에게는 충분하지 않다. 앱에는 native FCM이 필요했다.

### 6.2 적용된 커밋

```text
33f6a97 feat(push): add native FCM token registration for Android app
bf7b2a9 fix(push): avoid Capacitor plugin proxy as promise value in FCM register
8f91c1f fix(analytics): avoid Capacitor proxy thenable resolution
701ecf0 feat(push): FCM server-side dispatch via firebase-admin
af9fd11 chore(android): align vc20 Play release metadata
```

### 6.3 DB 상태

테이블: `FcmToken`

확인 완료:

- columns: `id`, `userId`, `token`, `platform`, `createdAt`, `updatedAt`
- indexes: `FcmToken_pkey`, `FcmToken_token_key`, `FcmToken_userId_idx`
- FK: `FcmToken_userId_fkey -> User`
- RLS: true
- 실기기 token 저장 검증: `0 -> 1`

주의:

- token 전체값을 로그/문서/채팅에 출력하지 말 것
- DB 조회 시 token 컬럼 전체를 직접 공유하지 말 것

### 6.4 production 발송 검증

완료:

- Vercel Production env 등록:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
- `firebase-admin` 서버 발송 구현
- 본인 userId 대상 service 푸시 1건 발송
- FCM 응답: `successCount=1`, `failureCount=0`
- 창업자 기기에서 실제 알림 수신 확인:
  - 21:14에 “FCM 서버 발송 검증입니다 🔔” 도착

판정:

**FCM token 수집 + 서버 발송 + 실제 기기 표시까지 end-to-end PASS.**

### 6.5 현재 발송 설계

단일 발송 진입점:

```text
src/lib/push/service.ts
pushService.notify(userId, payload, campaign, category)
```

설계:

- 같은 userId에 `FcmToken`이 있으면 FCM 발송
- `FcmToken`이 없으면 기존 VAPID 웹푸시 발송
- 중복 발송 방지를 위해 FCM이 있으면 웹푸시는 스킵
- 광고/마케팅 게이트는 채널 분기 전에 적용
- 무효 FCM token은 응답 기반으로 삭제
- 예약/broadcast 수신자 조회는 `PushSubscription` 또는 `FcmToken` 보유자 포함

### 6.6 FCM 남은 작업

P0:

- Play vc20 배포 완료 후 실제 사용자 token 유입 모니터링
- 어드민 즉시/예약 공지가 실제 앱 사용자에게 가는지 소량 확인

P1:

- 클라이언트 수신 핸들러 추가
  - foreground 상태에서 알림 표시
  - 알림 탭 시 `data.url` 딥링크 이동
  - 파일 후보: `src/components/features/push/AppFcmRegister.tsx`

P1 UX:

- 현재 앱 로그인 후 2.5초 뒤 native 권한 요청이 바로 시도될 수 있다.
- Android 13 이상에서는 OS 권한 팝업이 바로 뜰 수 있다.
- MVP로는 허용 가능했지만, 50대 60대 UX 관점에서는 나중에 기존 문구형 토스트와 연결하는 편이 좋다.

P2:

- iOS APNs/FCM 연동은 Android 안정화 이후 별도 진행
- 토픽 구독, 리치 푸시, 개인화 알림은 나중

보안 주의:

- Firebase Admin service account JSON이 채팅에 노출된 이력이 있다.
- 사용자는 “그냥 가도 된다. 깃에 배포만 안 하면 된다”고 결정했다.
- 그래도 절대 repo에 키 파일을 복사/커밋하지 말 것.
- 나중에 여유가 생기면 키 rotation 권장.

---

## 7. Android vc20 / Play Console 상태

현재 main 최신:

```text
af9fd11 chore(android): align vc20 Play release metadata
```

Play Console 화면 기준:

- vc20 / versionName 1.0.15 AAB 업로드됨
- 프로덕션 버전 생성 완료
- “전체 출시 시작” 선택됨
- 게시 개요에서 검토 중인 변경사항 표시
- 일반적으로 발견되는 문제 빠른 검사 진행/검토 상태

중요했던 이슈:

- Play가 AD_ID 관련 오류를 냈다.
- 원인: Play Console 광고 ID 선언과 Manifest 권한 불일치.
- 대응: `AndroidManifest.xml`에 `com.google.android.gms.permission.AD_ID` 포함 및 `build.gradle` versionCode 20 정렬.
- 이 대응 커밋이 `af9fd11`.

다음 세션 P0:

1. Play Console에서 vc20 현재 상태 확인
2. 검토 통과/게시 완료 여부 확인
3. 설치 가능한 최신 버전이 20인지 확인
4. 실제 사용자 업데이트 이후 FCM token이 늘어나는지 확인

주의:

- vc20 AAB가 이미 제출된 상태라면 같은 versionCode로 재업로드 불가
- 다음 native 변경은 versionCode 21 이상 필요
- 웹 코드 변경은 AAB 재빌드 없이 Vercel 배포로 반영

---

## 8. AdMob 현재 상태

### 8.1 확보된 값

```text
AdMob App ID: ca-app-pub-4117999106913048~8809650070
Android banner ad unit ID: ca-app-pub-4117999106913048/3137309547
Publisher ID: pub-4117999106913048
```

### 8.2 app-ads.txt

main 반영:

```text
5aea664 chore(ads): add app-ads.txt for AdMob
```

production 확인 완료:

```text
https://age-doesnt-matter.com/app-ads.txt
```

내용:

```text
google.com, pub-4117999106913048, DIRECT, f08c47fec0942fa0
```

확인된 것:

- HTTP 200
- 내용 exact match
- `www.age-doesnt-matter.com`은 root domain으로 redirect 후 200
- robots.txt에서 `/app-ads.txt` 차단 없음
- Play Console 개발자 웹사이트: `https://age-doesnt-matter.com/`

### 8.3 현재 AdMob 콘솔 상태

AdMob 화면 안내:

- Google crawler가 domain URL 변경을 감지하기까지 최대 7일 소요 가능
- 아직 app-ads.txt가 포함된 광고 요청 없음
- 신규 앱/신규 설정이라 테이블이 비어 있는 것은 정상

판정:

**우리 서버/도메인/Play URL/app-ads.txt 형식 문제는 없다. 현재는 Google 크롤링 및 app readiness 대기 상태.**

지금 할 일:

- 버튼을 계속 누르며 강제 갱신할 필요 없음
- 개발자 웹사이트 URL 추가/변경일과 app-ads.txt 배포일 기준 최대 7일 대기
- 7일 후에도 동일하면 AdMob 상태 재진단

### 8.4 AdMob 코드 상태

주의: `poc/admob-test` 브랜치에는 AdMob 실험/실ID 커밋과 매거진 커밋이 섞여 있다.

관련 커밋:

```text
2c85293 feat(android): add AdMob test banner MVP
f257818 chore(android): switch AdMob banner to real IDs
```

하지만 **전체 `poc/admob-test`를 main에 merge하면 안 된다.**

현재 main에는 app-ads.txt와 vc20 AD_ID 메타데이터 관련 수정만 들어간 상태로 봐야 한다. 다음 세션은 실제 main tree에서 `src/components/ad/AdMobBanner.tsx`, `strings.xml`, `AndroidManifest.xml`을 직접 확인할 것.

AdMob production 반영 조건:

1. app-ads.txt verified
2. app readiness 승인
3. 테스트 ID 잔존 0
4. 실제 App ID/banner ID 반영
5. 첫 화면/로그인/온보딩/글쓰기 방해 없음
6. AAB versionCode 증가 필요 여부 확인

---

## 9. Google Ads / GA4 / 전환 추적

현재 구조:

- 앱 gtag 차단 유지
- native Firebase Analytics 사용
- `sign_up`, `onboarding_complete`는 온보딩 완료 후 await 보장
- Google Ads conversion import 구조 준비됨

중요 해석:

- GA4 실시간 sign_up이 찍히는 것과 Google Ads 전환이 찍히는 것은 다르다.
- Ads 전환은 광고 유입 사용자 기준이다.
- 직접 설치/친구 테스트 가입은 Ads 전환에 안 잡히는 것이 정상이다.

현재 해야 할 일:

1. 소액 Google Ads AC 집행 후 다음날 GA4/Ads 확인
2. GA4 `sign_up`, `onboarding_complete` 자연 모니터링
3. Ads 전환은 광고 유입이 충분히 쌓인 뒤 판단
4. 앱 이벤트 누락 여부는 `FirebaseAnalytics.then()` 에러가 사라졌는지 logcat으로 확인 가능

이미 수정됨:

```text
8f91c1f fix(analytics): avoid Capacitor proxy thenable resolution
```

AAB 재빌드 불필요:

- 이 수정은 웹 번들이다.
- 앱은 production 웹을 로드하므로 Vercel 배포만으로 반영된다.

---

## 10. 매거진 SEO 작업 경계

중요: **매거진 작업은 이 세션에서 계속 진행한다. 새 세션은 매거진을 건드리지 말 것.**

현재 매거진 목표:

- 매일 얕은 글을 많이 발행하는 방식에서 벗어난다.
- 하루 2개, 오전/오후 1개씩 제대로 된 SEO 매거진을 만든다.
- Google 자동완성/GSC/SERP/PAA 기반으로 raw keyword universe를 만들고, 관련 글끼리 내부 링크로 연결한다.
- 1년 이상 콘텐츠 큐를 만들 수 있는 구조를 만든다.

현재 매거진 설계 핵심:

- raw keyword universe에는 모든 연관검색어를 보관한다.
- publishPolicy로 발행 여부만 분리한다.
- 민감 키워드는 삭제하지 않고 리서치/순화/비발행으로 관리한다.
- 제목은 건강, 관계, 대화 중심으로 순화한다.
- 먼저 2주치 파일럿 큐로 검증하고 GSC 반응을 본다.

현재 살아있는 발행 경로:

```text
launchd 2개
  -> local-magazine-runner.ts
  -> magazine-generator.ts main()
```

죽어 있거나 stale인 경로:

- GitHub Actions magazine schedule은 비활성
- `agents/cron/schedules.yaml`의 magazine 항목은 stale 선언에 가까움

중복 방지 원칙:

- 새 cron/script 발행 경로를 만들지 않는다.
- 기존 `magazine-generator.ts` 내부 입력만 keyword queue로 교체한다.
- duplicate guard는 유지한다.
- maxArticles 3 -> 2
- morning 1 / late 1 세션별 cap

현재 매거진 브랜치/파일:

```text
poc/admob-test
2721004 docs(magazine): define SEO keyword engine transition plan
9ae157a feat(magazine): add local SEO keyword research tools
5a8ff30 feat(magazine): add local SEO keyword universe tools
```

현재 중간 검증에서 나온 이슈:

1. 클러스터 오태깅
2. 중복 fetch 폭증
3. score 포화

현재 진행 중으로 보이는 파일:

```text
agents/magazine/keyword-research/autocomplete-collector.ts
agents/magazine/keyword-research/gsc-nearmiss.ts
agents/magazine/keyword-research/scorer.ts
```

새 세션 금지:

- 위 파일 수정 금지
- 매거진 keyword universe 작업 실행 금지
- launchd/runner/generator 수정 금지
- 매거진 branch 전체 main 반영 금지

---

## 11. iOS 남은 작업

iOS는 아직 본격 착수 전이다. Android vc20/FCM/AdMob 안정화 후 별도 트랙으로 간다.

예상 작업:

1. Capacitor iOS 프로젝트 정리
2. Apple Developer/App Store Connect 설정
3. Kakao OAuth iOS redirect/URL scheme 설정
4. Firebase iOS app 등록
5. APNs key/cert + FCM iOS 연동
6. iOS push permission UX 설계
7. App Store 정책 점검
8. TestFlight 내부 테스트
9. iOS analytics/sign_up/onboarding_complete 검증

주의:

- Android server.url 운영 방식은 iOS에서 정책 리스크가 더 크다.
- iOS는 별도 정책 검토 후 진행해야 한다.
- AdMob iOS는 Android와 별도 App ID/ad unit이 필요할 수 있다.

---

## 12. 남은 업무 우선순위

### P0 — 바로 확인해야 하는 것

1. Play vc20 심사/게시 상태 확인
2. vc20 설치 가능 여부 확인
3. vc20 이후 FCM token 증가 확인
4. FCM service/admin push가 실제 운영 사용자에게 정상 분기되는지 소량 확인
5. AdMob app-ads 상태는 대기. 조급하게 코드 반영하지 않기

### P1 — 리텐션 개선

1. FCM foreground 알림 표시
2. notification tap -> `data.url` 딥링크 이동
3. 알림 권한 요청 UX 개선
4. 어드민 푸시 패널에서 앱/웹 발송 결과 가시성 개선

### P1 — 광고/전환

1. GA4 `sign_up`, `onboarding_complete` 모니터링
2. Google Ads AC 실제 광고 유입 후 전환 확인
3. AdMob app-ads/app readiness 승인 상태 재확인

### P2 — AdMob 실제 수익화

1. app readiness 승인 후 실제 AdMob banner 코드 main 반영 판단
2. UI 겹침/FAB 가림 확인
3. 첫 화면/온보딩/로그인/글쓰기에는 광고 노출 금지
4. 필요 시 vc21 AAB 준비

### P2 — iOS

1. iOS 정책/기술 설계
2. APNs/FCM/Kakao/Auth/Analytics 검증 계획
3. TestFlight 준비

### P3 — 매거진

매거진은 현재 세션에서 계속. 다른 세션에서 하지 않는다.

---

## 13. Claude Code에게 줄 프롬프트 템플릿

### 13.1 vc20 Play 상태 read-only 확인

```text
Play Console vc20 상태를 read-only로 확인해라.

금지:
- 코드 수정 금지
- 커밋 금지
- Play 조작 금지
- git add . 금지

확인:
1. 현재 origin/main 커밋
2. vc20 versionCode/versionName
3. Play Console 상태: 검토중/게시됨/거부/오류
4. 출시율
5. 설치 가능 여부
6. FCM/AD_ID 관련 경고가 남아있는지

결과만 보고해라.
```

### 13.2 FCM 클라이언트 수신 핸들러 설계

```text
FCM 앱 클라이언트 후속을 read-only로 설계해라.

목표:
- 앱 foreground 상태에서 알림 표시
- 알림 탭 시 data.url로 앱 내 이동
- 기존 FCM token registration과 충돌 금지
- 웹푸시/VAPID 회귀 금지

확인 파일:
- src/components/features/push/AppFcmRegister.tsx
- src/lib/push/fcm-register.ts
- src/lib/push/fcm-sender.ts
- src/lib/push/service.ts
- 기존 deep link handler 관련 파일

금지:
- 코드 수정 금지
- DB write 금지
- 커밋 금지

산출:
1. 현재 AS-IS
2. 구현 위치
3. 위험
4. 최소 수정 파일
5. 검증 계획
```

### 13.3 AdMob app-ads 상태 확인

```text
AdMob app-ads.txt/app readiness 상태를 read-only로 확인해라.

확인:
1. https://age-doesnt-matter.com/app-ads.txt HTTP 200 + 내용 exact
2. www redirect
3. robots.txt 차단 여부
4. Play developer website URL
5. AdMob 화면 상태: 마지막 크롤링, app-ads 상태, app readiness

금지:
- 코드 수정 금지
- AdMob 설정 변경 금지
- Play 설정 변경 금지
- 커밋 금지

결론:
- 대기인지
- 조치 필요한지
- production AdMob 코드 반영해도 되는지
```

### 13.4 GA4/Ads 전환 모니터링

```text
GA4/Google Ads AC 전환 상태를 read-only로 확인해라.

확인:
1. GA4 sign_up/onboarding_complete 최근 수신
2. 앱 native analytics 에러 로그 여부
3. Ads conversion import 상태
4. 광고 유입 기준 전환이 있는지
5. 직접 설치/친구 테스트와 광고 전환을 혼동하지 말 것

금지:
- 코드 수정 금지
- Ads 설정 변경 금지
- 커밋 금지

결과:
- 정상/비정상 판정
- 더 기다려야 하는지
- 수정 필요 여부
```

### 13.5 iOS 계획 수립

```text
iOS Capacitor 전환을 read-only로 설계해라.

전제:
- Android vc20/FCM 안정화 후 진행
- Android 운영 정책 문서와 현재 main 상태를 먼저 읽을 것

확인:
1. 현재 ios/ 상태
2. Capacitor config
3. Firebase iOS 필요 작업
4. Kakao OAuth iOS 필요 작업
5. APNs/FCM 필요 작업
6. App Store 정책 리스크
7. TestFlight 검증 계획

금지:
- 코드 수정 금지
- Xcode 프로젝트 수정 금지
- 인증서/키 생성 금지
- 커밋 금지
```

---

## 14. 절대 금지 / 주의 사항

- `git add .` 금지
- 전체 `poc/admob-test` merge 금지
- 매거진 진행 파일 건드리기 금지
- community dirty 파일 건드리기 금지
- Firebase private key 출력 금지
- FCM token 전체값 출력 금지
- AdMob 테스트 ID를 production에 올리기 금지
- 앱 WebView에서 AdSense 재가동 금지
- Kakao permanent redirect URI 삭제 금지
- Raw SQL 직접 실행 금지. 단 창업자가 Supabase 콘솔에서 명시 SQL을 직접 실행하는 것은 별도 승인된 예외
- Play versionCode 재사용 금지
- DB migration과 코드 배포 순서 혼동 금지

---

## 15. 빠른 확인 명령

작업 시작:

```bash
git status --short
git branch --show-current
git fetch origin
git log --oneline -10 origin/main
```

main clean worktree:

```bash
git worktree add --detach /tmp/unaeo-main-check origin/main
cd /tmp/unaeo-main-check
```

검증:

```bash
npm run typecheck
npm run lint
npm run build
npx prisma generate
npx cap sync android
cd android && ./gradlew assembleDebug
```

app-ads.txt:

```bash
curl -L https://age-doesnt-matter.com/app-ads.txt
curl -L https://www.age-doesnt-matter.com/app-ads.txt
curl -L https://age-doesnt-matter.com/robots.txt
```

---

## 16. 다음 세션의 첫 판단

다음 세션은 새 기능을 바로 만들지 말고 먼저 아래를 확인한다.

1. Play vc20이 실제로 게시 완료됐는가?
2. vc20 설치 후 일반 사용자가 FCM token을 저장하는가?
3. 어드민/예약 푸시가 앱 사용자에게 FCM으로 가는가?
4. AdMob은 아직 Google 크롤/심사 대기인가?
5. GA4/Ads 전환은 광고 유입 기준으로 정상 해석되고 있는가?

현재 가장 중요한 운영 관점:

**리텐션이 목표이므로 FCM 안정화가 AdMob보다 우선이다.**  
AdMob은 대기할 수 있지만, 푸시와 알림 경험은 지금 제품 유지율에 직접 연결된다.

