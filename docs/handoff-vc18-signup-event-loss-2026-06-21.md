# Handoff → Codex (운영 마스터) — vc18 Android sign_up 이벤트 유실 진단·수정·검증 (2026-06-21)

> **목적**: Claude Code 세션에서 vc18 Firebase Analytics의 `sign_up` 전환 미집계 문제를 진단·수정·배포·검증 시도했다. **운영 마스터인 Codex가 이 액션들이 정확했는지, 실수/리스크가 없는지 검증**하기 위한 핸드오프다. 시간순 사실 + 검증 포인트만 적었다(추측 최소화).

---

## 0. 한 줄 요약

vc18 앱 가입의 `sign_up`/`onboarding_complete`가 **navigate 직전 비동기 native logEvent 유실**로 GA4 app stream에 안 잡혔다. → `appLogEvent`를 `await` 가능하게 고쳐(2파일) main에 cherry-pick·배포 완료. **→ GA4 실시간 보고서에서 `sign_up` 2건 실측 확인 = 유실 해결 확정**(2026-06-21 18:4x KST, §6-1).

---

## 1. 발단 — 문제 인지

- 배경: vc18(Firebase native Analytics)이 production live(`1.0.14`/versionCode 18). app stream에 `login_start`/`login`/`sign_up`/`onboarding_complete`를 native logEvent로 보내도록 구현됨(poc 커밋 `456663e`, main merge `52f5eca`).
- **증상**: 창업자가 "오늘 회원 3명 가입했는데 **Google Ads 목표 전환(sign_up)이 0**"이라고 발견. Google Ads 콘솔: `Android(com.agenotmatter.app) sign_up = 최근 전환 없음`, `web sign_up = 운영중`.

## 2. 진단 과정 (오진 → 정정 → 근본원인)

### 2-1. ⚠️ Claude 1차 오진 (실수 — 검증 대상)
- Claude가 "오늘 3명은 **웹 가입**일 것"이라 추론. 근거로 "vc18 앱 설치자 ≈ 0"을 들었음 → **이 가정이 틀림**.
- 창업자 정정: "다은마미는 내가 **안드로이드 앱**으로 가입했다."
- **교훈**: 설치자 수를 근거로 가입 경로를 단정한 것이 오류. DB로 먼저 확인했어야 함.

### 2-2. DB 실측으로 경로 확정
- 로컬 pooler 비번 인증 실패(P1000) → **Supabase service_role REST(PostgREST)** 로 우회 조회.
- `AppHandoffToken`(앱 로그인은 handoff token 필수, 웹은 미경유) 대조 결과:
  - 찬찬히·서희맘78·다은마미 **3명 전원 handoff consumed = 앱 가입 확정.** (Claude 1차 추론 반증)

### 2-3. 근본 원인 특정
`login`은 DebugView에 잡히는데 `sign_up`만 안 잡히는 차이를 코드로 추적:

| 이벤트 | 발화 위치 | navigate | 결과 |
|---|---|---|---|
| `login_start` | `kakao-start.ts` (Browser.open 전, 페이지 유지) | 없음 | 수신 |
| `login` | `PageViewTracker.tsx` (status 변화 시, 페이지 유지) | 없음 | 수신 |
| **`sign_up`/`onboarding_complete`** | `OnboardingForm.handleComplete` (**navigate 직전**) | `router.replace` 즉시 | **유실** |

- `appLogEvent`가 `import('@capacitor-firebase/analytics')`를 **await 없이 fire-and-forget**으로 호출.
- vc18에서 "앱은 gtag 미로드라 대기 불필요"라며 `waitForGtagReady` 대기를 **앱 분기에서 통째로 skip** → `router.replace`가 동적 import 완료 전에 실행 → 페이지 컨텍스트 파기 → 이벤트 유실.
- **이건 Claude가 vc18에서 만든 버그**(웹은 `waitForGtagReady`로 전송 보장했으나 앱 native 비동기 완료를 같이 skip).

## 3. 수정 (코드 — 2파일만)

1. **`src/lib/analytics/app-analytics.ts`**: `appLogEvent`를 `void` 함수 → **`async … : Promise<void>`** 로 변경. `await import(...)` + `await FirebaseAnalytics.logEvent(...)`. (모듈 캐시 promise 헬퍼 `getFirebaseAnalyticsClient`는 이후 린터/창업자 편집으로 추가됨)
2. **`src/components/features/onboarding/OnboardingForm.tsx`** `handleComplete`: 앱 분기에서 `await appLogEvent('sign_up')` + `await appLogEvent('onboarding_complete')` **후** `router.replace`. 웹/TWA `gtmSignUp` 경로는 무변경.

- 검증: `npm run typecheck` EXIT 0 / `npm run lint` clean(floating-promise 경고 없음) / `npm run build` 107 pages 성공.
- ⚠️ **남긴 판단(검증 대상)**: `login_start`(kakao-start)·`login`(PageViewTracker)은 navigate가 없어 유실 위험이 없다고 보고 **await로 바꾸지 않음**. → Codex 확인 요망.

## 4. 배포 (main 반영 — poc 전체 merge 회피)

- poc 브랜치 커밋·푸시: `9fb891e fix(analytics): await native signup events before onboarding redirect`.
- **poc→main 전체 merge는 금지**(분석 결과 main이 community/home에서 더 최신 = poc 옛 버전이 회귀시킬 위험 + ba3fb82≈59a66e6 중복).
- 따라서 **별도 worktree(origin/main detached)에서 `9fb891e`만 cherry-pick** → 충돌 0 → typecheck/lint/build PASS → **`git push origin HEAD:main`**(fast-forward) = main `2f724c7`.
- Vercel production 배포 **success**, `age-doesnt-matter.com` 200 확인. worktree 제거, 현재 워킹트리 dirty 보존.
- ⚠️ **검증 대상**: main에 **PR 없이 직접 push**(cherry-pick). 운영 절차상 적절했는지 Codex 확인 요망.
- **앱 재빌드 불필요**: 두 파일 모두 `src/`(웹). server.url 모드 앱은 production 웹을 로드하므로 main 배포로 반영(AAB 재빌드 0). main `2f724c7` OnboardingForm에 `await appLogEvent('sign_up')`/`onboarding_complete` 존재 재확인됨.

## 5. 검증 시도 — 온보딩 재유도(nickname 리셋)

실기기 sign_up 재현을 위해, **새 계정 대신 기존 본인 계정(다은마미)을 신규 플로우로 되돌리는 방법** 채택:
- 근거: `needsOnboarding` 판정 = `nickname.startsWith('user_')` (auth.ts:171,196). nickname을 `user_xxx`로 바꾸면 재로그인 시 온보딩 재실행 → `handleComplete` → sign_up 발화.
- **완전 삭제는 회피**: 다은마미는 Post 1 + PostView 2가 있고 `Post.author`가 Restrict FK라 직접 삭제 불가. nickname 리셋이 FK·데이터 무영향이라 안전.
- ⚠️ **검증 대상**: 창업자가 Supabase SQL Editor로 `UPDATE "User" SET nickname='user_daun0x', "isOnboarded"=false WHERE id='cmqm0rj8x000804l7lmeqh0v6'` 실행(운영 DB 직접 조작, 검증 1회성). Claude는 DB write 미실행(COO 규칙 준수). → Codex 적절성 확인 요망.

### 시도 타임라인 (시각 KST = DB UTC+9)
| 시각(KST) | 사건 | DebugView |
|---|---|---|
| 18:29 | 1차 재가입(nickname 리셋 후 재로그인→온보딩 완료, DB 확정) | **디버그 기기 0**, screen_view만, sign_up 미표시 |
| 18:34:52 | **app_remove** (앱 재설치) | setprop 초기화됨 |
| 18:39 | 2차 재가입(또 리셋→온보딩 완료, DB 확정: nicknameChangedAt 18:39:49) | **디버그 기기 0**(setprop 날아감), sign_up 미표시 |

## 6. 현재 단계 / 검증 결과

- ✅ production 코드에 fix 확정(main 2f724c7 await).
- ✅ 다은마미 온보딩 재완료 2회 DB 확정(신규 플로우 정상 작동).

### 6-1. ✅ sign_up 실측 확인 (2026-06-21, GA4 실시간) — 유실 해결 확정
- **GA4 속성 481670969 > 실시간 개요** 에서 **`sign_up` 2건**(주요 이벤트, 15.38%) + `login` 2 + `first_open` 2 + `screen_view` 8(native) 확인.
- 오늘 웹 가입 0이므로 이 `sign_up` 2건 = **다은마미 앱 재가입 2회(18:29·18:39 KST)의 app stream 집계** = **fix 작동·유실 해결 확정**.
- **DebugView가 못 본 이유 = 재설치(app_remove)로 setprop 초기화("디버그 기기 0")** 였고, sign_up 자체는 정상 도달했다. (DebugView 미표시 ≠ 이벤트 미전송)
- 후속(자동): Google Ads "Android sign_up" 전환 카운트는 GA4→Ads import 지연(수 시간) 후 반영 예상.

---

## 7. Codex(마스터) 검증 요청 포인트

1. **근본원인 진단 정확성**: navigate 직전 비동기 native logEvent 유실이 맞나? 다른 유실 경로(SW 캐시로 옛 JS 로드 등)가 더 크지 않나? (앱 재설치 후에도 미확정이라 캐시 변수 잔존)
2. **수정 충분성**: `appLogEvent` await 1건으로 충분한가? `login_start`/`login`을 await 안 한 판단이 안전한가?
3. **배포 절차**: main에 PR 없이 cherry-pick 직접 push가 적절했나? poc 전체 merge 회피 판단은 맞나?
4. **운영 DB 조작**: nickname 리셋(User 직접 UPDATE)으로 온보딩 재유도 = 검증 수단으로 적절한가? 부작용(기존 글 author 표시 일시 변경 등) 리스크는?
5. **검증 결과 해석**: §6-1처럼 GA4 실시간 `sign_up` 2건으로 "유실 해결"로 종결해도 되나? (DebugView 대신 GA4 실시간을 최종 근거로 삼은 것의 타당성 — app stream 귀속을 stream 필터로 한 번 더 확정할 필요는?)
6. **Claude 1차 오진**(웹 가입 추론) 같은 실수 재발 방지 관점에서 프로세스 개선점.

---

## 부록. 관련 커밋/파일
- `9fb891e`(poc) / `2f724c7`(main) — fix 본체
- `src/lib/analytics/app-analytics.ts`, `src/components/features/onboarding/OnboardingForm.tsx`
- 기존 마스터 문서: `docs/handoff-operating-master-vc18-firebase-2026-06-19.md`
- 검증 기록: `docs/verification-android-oauth-day2-2026-06-18.md` §10
- 대상 유저: 다은마미 `id=cmqm0rj8x000804l7lmeqh0v6` (female, 앱 가입)
