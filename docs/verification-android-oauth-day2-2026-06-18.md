# Android Capacitor OAuth Handoff (Day2) — 검증 결과 기록

> 작성 2026-06-18 (KST) · 상태: **부분 PASS (홀드)** · 코드 동결
> 브랜치 `poc/ios-capacitor-2-1` · 커밋 `8e47896`(구현) + `f65a70a`(signIn app-handoff 통과 fix)
> 설계 정본: [docs/design/phase-2-2-oauth-handoff.md](./design/phase-2-2-oauth-handoff.md)
> ⚠️ [docs/handoff-android-capacitor-oauth-2026-06-18.md](./handoff-android-capacitor-oauth-2026-06-18.md)는 **디버깅 시작 시점(yfqzk0hao / versionCode 9 / "미통과")의 stale 핸드오프**다. 현재 상태는 본 문서 기준.

---

## 1. 검증 결과 (창업자 지정 항목)

| 항목 | 판정 | 근거 |
|---|---|---|
| **기존 여성 로그인** | ✅ **PASS** | 실기기 + DB 실측 |
| **handoff token 발급 / consume / session** | ✅ **PASS** | DB 실측 (아래) |
| **신규 여성 온보딩** | 🟡 **코드상 PASS 가정 (모니터링 필요)** | 테스트 계정 부재로 실기기 미검증. handoff 경로는 기존 여성 PASS와 **동일**, 신규 분기(`user.create` + `needsOnboarding` → middleware `/onboarding`)는 jwt 콜백의 **기존 검증 로직**. **production 모니터링으로 실검증 대체** |
| **신규 남성 차단** | 🟡 **코드상 PASS 가정 (모니터링 필요)** | 테스트 계정 부재로 실기기 미검증. 기존 `signIn` male 차단 로직 기반(이번 **미변경**), production 웹에서 이미 작동 중(BotLog `gender_blocked` 다수). **production 모니터링으로 실검증 대체** |
| **production 전환 전 client secret** | 🔴 **재발급/교체 필요** | 디버깅 중 `KAKAO_CLIENT_SECRET` 노출 → 4ec06 키 secret 재발급 후 production·Preview env 교체 필수 |

### PASS 상세 — DB 실측 (read-only)
- `AppHandoffToken` 최신 row: `created` 직후(~1초) `consumedAt` 채워짐 → **nonce 1회 소비(replay 차단) 정상**.
- `BotLog` AUTH_FAILURE(FAILED): 로그인 성공 후 **0건**.
- `User` `하이요 (female / ACTIVE)`: `lastLoginAt` 로그인 시각으로 갱신.
- → handoff 전체 체인(start → bridge → 딥링크 → credentials authorize → signIn) 작동 입증.

---

## 2. 디버깅으로 해소된 2대 막힘

| 단계 | 증상 | 원인 | 해소 |
|---|---|---|---|
| token 교환 | callback/kakao → `Configuration` / KOE010 `invalid_client` | **Vercel Preview `KAKAO_CLIENT_SECRET`이 4ec06 키와 짝 안 맞는 오값** | Preview secret을 4ec06 키 시크릿(= Production 값)으로 교정 |
| 세션 발급 | callback/app-handoff → `AccessDenied` | `signIn` 콜백 `provider!=='kakao' → return false`가 Credentials `app-handoff`까지 차단 | `signIn`에 `app-handoff` 통과 분기 추가(`f65a70a`). kakao 남성차단/상태검증 유지, auth.config.ts 무변경 |

- 카카오 REST API 키 2개 존재(`Default 3a0c…` / **`우리 나이가 어때서 4ec06`**). **앱 로그인은 4ec06로 통일**(clientId+secret 모두 4ec06, redirect도 4ec06에 등록).

---

## 3. 🔴 production 전환 전 필수

1. **카카오 Client Secret 재발급/교체** — 디버깅 중 `KAKAO_CLIENT_SECRET` 값이 스크린샷·로그에 노출됨. 4ec06 키 Client Secret 재발급 → **production·Preview env 모두 새 값으로 교체 후 재배포**.
2. **production 정식 빌드**: poc→main merge + production 배포 → `capacitor.config.ts` server.url = `https://age-doesnt-matter.com` → versionCode 13↑ 재빌드. 이로써 Preview deployment-URL마다 카카오 redirect 재등록하던 반복 종료.

---

## 4. 빌드/배포 이력 (Day2)

- AAB versionCode: 8(1.0.4) → 9 미사용 → 10(1.0.6) → 11(1.0.7) → **12(1.0.8, 현재)**. Play는 한 번 쓴 versionCode 재사용 거부 → 다음 13↑.
- 빌드 환경: **JDK 21**(`/opt/homebrew/opt/openjdk@21`) + Bubblewrap SDK(`~/.bubblewrap/android_sdk`, platform android-36). Capacitor 8.4는 JDK 21 필수(JDK 17은 `invalid source release: 21` 실패).
- 서명: `migration-backup/android/android.keystore`(alias `android`) — upload key SHA 일치(Play 업데이트 경로 유효). 서명은 창업자 `jarsigner` 수동.
- Preview URL 변천: 55bfl5ak8 → 7e9aothm2 → yfqzk0hao(KOE010) → ma4q7mecg(secret 교정) → **8smrk78ae**(signIn fix, 현재). deployment-URL마다 카카오 redirect 재등록 필요(브랜치명이 길어 git-branch alias 미생성).
- 현재 검증용 Preview: `https://age-doesnt-matter-8smrk78ae-mogoyongseok-8318s-projects.vercel.app` (server.url 반영, AAB versionCode 12).

---

## 5. 다음 단계 (홀드 중 — 코드·배포 동결)

- [ ] (택1) 테스트 계정 확보 → 신규 여성/남성 실기기 검증 → Day2 완전 PASS
- [ ] (택1) production 정식 빌드: **client secret 재발급** → main merge → production 배포 → production URL 재빌드(versionCode 13↑)
- [ ] Day3: FCM 푸시 (별도 게이트 — prisma/firebase)

---

## 6. production 전환 체크리스트

> 신규 여성/남성은 실기기 미검증(코드상 PASS 가정) → **production 모니터링으로 실검증을 대체**한다. 그러려면 production 전환이 선행돼야 한다.

### 6-A. 선결 (창업자 — 외부 콘솔)
- [ ] **카카오 4ec06 Client Secret 재발급** (디버깅 중 노출) → **production·Preview env(`KAKAO_CLIENT_SECRET`) 모두 새 값으로 교체** → 재배포. (기존 secret 무효화)
- [ ] production env 확인: `APP_HANDOFF_SECRET`(이미 등록), `KAKAO_CLIENT_ID`(4ec06), `AUTH_SECRET` 누락 없음.
- [ ] `AppHandoffToken` 테이블 production 적용 확인(이미 Supabase 실행됨) + `prisma migrate resolve --applied 20260618120000_add_app_handoff_token` bookkeeping 마무리.
- [ ] 카카오 production redirect 이미 등록됨: `https://age-doesnt-matter.com/api/auth/callback/kakao`, `https://www.age-doesnt-matter.com/api/auth/callback/kakao` → **Preview URL 반복 등록 종료**.

### 6-B. 코드/배포 (승인 게이트)
- [ ] `poc/ios-capacitor-2-1` → **main merge** (PR, 충돌 확인). main에 isCapacitor/광고OFF/handoff 코드 반영.
- [ ] main → production 배포 (Vercel) → production 도메인에 코드 반영.
- [ ] `capacitor.config.ts` server.url = **`https://age-doesnt-matter.com`** (Preview → production).
- [ ] `android/app/build.gradle` versionCode **13↑** (현재 12, Play production 5보다 높게) + versionName 상향.
- [ ] `npx cap sync android` → AAB 재빌드(JDK21) → 창업자 `jarsigner` 서명.

### 6-C. 배포·rollout
- [ ] Play 내부 테스트에 production-URL AAB(versionCode 13↑) 업로드 → 실기기 설치.
- [ ] `https://age-doesnt-matter.com/api/health/auth` 200 확인.
- [x] **rollout**: ~~단계 rollout(5%→20%→100%), 한 번에 100% 금지~~ — *이는 작성 시점의 보수적 권장안이었다.* **현 상태 = 내부 테스트 트랙 100% 제공**(production 트랙은 아직 vc5/1.0.1). §8에서 **내부 테스트 vc13 안정성 PASS** 확인됨(health 200 / AUTH_FAILURE 0 / handoff consume 실패 0 / 기존 여성 로그인 유지). production 트랙 승급 시 100% 여부는 창업자 선택(§8-1). Play crash/ANR은 production 출시 후 확인.
- [ ] 기존 TWA 사용자 영향 고지: Capacitor 업데이트 시 **재로그인 + 푸시 재구독**(쿠키/푸시 모델 차이). PWA·웹 유저 무영향.

### 6-D. 회귀 확인 (main merge 영향)
- [ ] 웹/TWA 카카오 로그인 회귀 0 (`window.Capacitor` 부재 → 분기 미발동, 기존 동작 유지).
- [ ] 웹 AdSense/쿠팡 정상(광고 OFF는 앱에서만).
- [ ] Edge 미들웨어 정상(`auth.config.ts` 무변경 유지).

---

## 7. production 모니터링 (신규 여성/남성 실검증 대체)

production 전환 후 아래를 관찰해 보류 2건을 실데이터로 확정한다.

- **신규 여성 온보딩**: 앱(Capacitor) 경로 신규 `User(female)` 생성 + `needsOnboarding` 흐름 정상 + 온보딩 완료율. AppHandoffToken consume 정상.
- **신규 남성 차단**: 앱 경로에서 `BotLog gender_blocked(SKIP)` 발생 + 해당 providerId **User 미생성** 확인. (앱 사용자 식별: `x-bot-type` 아님 / UA·referrer로 구분 어려우면 시점 대조)
- **공통**: `BotLog AUTH_FAILURE(FAILED)` 급증 없음(시드 알림 임계), `/api/health/auth` 200 유지.
- 이상 발견 시 즉시 rollout 중단 + 롤백(이전 versionCode/TWA).

---

## 8. 내부 테스트 vc13 안정성 — ✅ PASS (2026-06-19)

> ⚠️ **트랙 구분(중요)**: 현재 `vc13 / 1.0.9`는 **내부 테스트 트랙 100% 제공** 상태다. **production 트랙은 아직 `versionCode 5 / 1.0.1`(기존 TWA)이 100%**다. 즉 "production 100% rollout"이 **아니라** "내부 테스트 vc13 안정성 PASS"다.

- merge(웹 코드): PR #5(`10a9f1b`, Day1-2 OAuth handoff) + PR #6(`641a233`, server.url=production+vc13). main 반영 → **웹 production 배포는 완료**.
- 앱 AAB: **versionCode 13 / 1.0.9 / server.url=`https://age-doesnt-matter.com`** → **내부 테스트 트랙에 100% 제공**(production 트랙 미승급).
- **기존 여성 로그인 PASS**(하이요, 내부 테스트 앱): lastLoginAt 갱신 + AppHandoffToken 발급/소비 + AUTH_FAILURE 0.

### 내부 테스트 vc13 모니터링 (read-only 실측)
| 항목 | 결과 |
|---|---|
| `/api/health/auth` 200 | ✅ 유지 |
| AUTH_FAILURE(FAILED) 1h/6h | ✅ 0 / 0 |
| AppHandoffToken consume 실패 | ✅ 발급=소비, 미소비+만료 0 |
| 기존 여성 로그인 | ✅ 유지 |
| 신규 여성 생성·신규 남성 차단 | ⚪ 유입 0 (이상 아님, 유입 시 확정) |

→ **내부 테스트 vc13 안정성 PASS**(확인 가능 항목 이상 0). *Play crash/ANR은 production 출시 후 확인 항목으로 이동(§8-1).*

### 8-1. 다음 단계 — production 트랙 승급
- [ ] **vc13/1.0.9를 production 트랙으로 승급/출시** (현재 내부 테스트 → production). production 트랙은 아직 vc5/1.0.1.
- [ ] 승급 시 **100% rollout 여부는 창업자 선택**(단계 rollout vs 100%). 기존 TWA(vc5) 사용자 → Capacitor 업데이트 시 재로그인/푸시 재구독 영향 고지.
- [ ] **production 출시 후 확인**: Play Console → 품질 → **Android vitals(crash rate / ANR rate)** 임계 이내. *(내부 테스트 단계에선 표본이 작아 production 출시 후 모니터링)*

---

## 9. 광고 집행 전 체크리스트

> 광고(Google Ads 등) 집행 시작 전 마지막 점검. 1~4는 실기기/브라우저 수동, 5~6은 DB/지표 쿼리.

### 9-1. 앱 기능 (실기기 — 창업자)
1. **설치/로그인/홈 진입**: vc13(1.0.9) 설치 → 카카오 로그인 → 홈 렌더 정상.
2. **글 상세/댓글/글쓰기**: 글 상세 진입, 댓글 작성, 글쓰기(이미지 포함) 정상 동작.
3. **앱 광고 OFF 유지**: 앱 WebView에서 `ins.adsbygoogle`·`script[adsbygoogle]`·`[data-ad-client]` **0** (쿠팡 CPS는 정책 트랙, 차단 아님).
4. **웹 광고 정상**: 데스크탑/모바일 브라우저(앱 아님)에서 AdSense·쿠팡 정상 노출(앱만 OFF, 웹 회귀 0).

### 9-2. 신규 여성/남성 production 모니터링 — read-only 확인 항목 (5)

> **Raw SQL 금지 원칙**(CLAUDE.md) — 조회는 **Prisma 클라이언트**(`prisma.user.findMany` / `prisma.botLog.count` / `prisma.appHandoffToken.*`) 또는 **Supabase 콘솔/대시보드**로 수행한다. 아래는 **확인할 지표(무엇을 볼지)**이며 Raw SQL 실행문이 아니다.

| 확인 항목 | 기준 (Prisma / 콘솔) | 정상 |
|---|---|---|
| **신규 여성 가입+온보딩** | `User` where `gender=female` + 최근 24h 생성. `nickname`이 `user_…`면 온보딩 전, 변경됐으면 완료 | 생성 정상 + 온보딩 진행/완료 |
| **신규 남성 차단** | `BotLog` where `action=AUTH_FAILURE`, `status=SKIP`, details에 `gender_blocked`, 최근 24h | 차단 기록 발생 + **해당 providerId가 `User`에 미생성** |
| **handoff consume 건전성** | `AppHandoffToken` 최근 6h: 발급 수 = 소비(`consumedAt` 채워짐) 수, 미소비+만료(`consumedAt` null & `expiresAt` 경과) = 0 | 발급=소비, 실패 0 |

- ⚠️ 타임존: `lastLoginAt`·`createdAt`은 표시상 KST/UTC 혼동이 있으니 **상대 기간(최근 N분/시간) 기준**으로 판정한다(절대 시각의 JS 차이 계산은 오차).

### 9-3. 광고 유입 후 첫 24시간 지표 (6)
- **인증 안정성**: AUTH_FAILURE(FAILED) 시간당 급증 없음(시드 임계), `/api/health/auth` 200, handoff consume 실패 0.
- **유입 품질**(GA4/EventLog): 광고 클릭→앱설치/웹방문→로그인 전환, 즉시이탈률, D1 흔적.
- **여성 전용 정책**: 신규 남성 `gender_blocked` 차단율 + User 미생성, 신규 여성 온보딩 완료율.
- **앱 안정성**: Play crash/ANR rate(콘솔), 광고 OFF 유지(앱 DOM).
- **수익 회귀**: 웹 AdSense/쿠팡 노출·수익 정상(앱 OFF가 웹에 영향 없는지).
- 이상 시: 광고 일시중단 + 원인 분리(인증/렌더/광고/유입 hop별).

---

> **Day1~2 + production 전환 완료.** 광고 집행은 9장 체크리스트 통과 + Play crash/ANR 확인 후 진행.

---

## 10. vc18 Firebase Analytics production 배포 검증 (2026-06-19)

- **Play Store**: versionName **1.0.14** (versionCode 18) 게시 완료.
- **Firebase DebugView 수신 확인** (앱 native → GA4 app stream): `first_open` / `session_start` / `screen_view` / `login_start` / `login`.
- **미확인**: `sign_up` / `onboarding_complete` — **신규 가입 테스트 미실시**(기존 계정 로그인만 검증). 코드 분기는 OnboardingForm 가입 완료 지점에 존재.
- **후속**: 신규 여성 가입 1건 실시 → `sign_up`·`onboarding_complete` native 수신 확인. 또는 production 모니터링으로 신규 유입 발생 시 GA4 app stream 집계로 대조.
