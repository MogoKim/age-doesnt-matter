# 기술 부채 추적 (TECH-DEBT)

> 채널(웹/PWA/TWA)·실험 정밀 분석 + 2개 AI 세션 교차검증으로 확정한 부채 목록.
> 최초 정리: 2026-06-09 | 단일 진실 = 이 문서. (plan 임시파일 아님)
> 코드가 바뀌면 이 문서도 갱신(feature-lifecycle). 항목 해결 시 "해결됨"으로 이동.

---

## 🔴 미해결 부채 (우선순위순)

| ID | 우선 | 한 줄 증상 | 근본 원인 (파일) | 근본 해결책 | 상태 |
|----|------|-----------|----------------|------------|------|
| **C1** | 🟡 Med | TWA 가입자 측정이 실제보다 적게 잡힐 수 있음 | `getBrowserEnv`([gtm.ts:167](../../src/lib/gtm.ts#L167))가 `android-app://` referrer만 보고 `_twa_confirmed` sticky 미반영. OAuth 콜백 후 referrer 소실 → `android-chrome` 오기록 | `getBrowserEnv`에 `_twa_confirmed` sticky 보강 (→ C7도 함께 정리) | 미착수 |
| **C2** | 🟡 Med | TWA 진입 게이트를 **급히 끌 스위치가 없음** | `flags.twa`([feature-flags.ts:9](../../src/lib/feature-flags.ts#L9)) 정의만 있고 사용처 0 (dead) | `TwaEntryGate`에 `if (!flags.twa) return` 가드 연결 | 미착수 |
| **C5** | ⚪ Low | 안 쓰는 환경변수 + 기본값 모순 | `env.ts:111-113` FEATURE_* export 미사용 (기본 `'false'`), `feature-flags.ts`는 기본 ON (`!=='false'`) — 정반대 | env.ts 죽은 export 제거 또는 단일화 | 미착수 |
| **C6** | ⚪ Low | "일자리 알림 받을래요?" 푸시가 영영 안 뜸 | `setPushToastTrigger('job')` 호출처 0 (UI·메시지는 완비, `'comment'`만 호출) | jobs 페이지/저장 시점에 `setPushToastTrigger('job')` 연결 | 미착수 |
| **C7** | ⚪ Low | 환경 감지 함수 2벌 중복 (drift) | `detectEnv`([AddToHomeScreen.tsx:31](../../src/components/common/AddToHomeScreen.tsx#L31))와 `getBrowserEnv`([gtm.ts:167](../../src/lib/gtm.ts#L167)) UA 분기 복제. detectEnv엔 twa-android 분기 **없음** | 두 함수 통합 (C1 수정과 함께) | 미착수 |

---

## C1 상세 — 영향 분해 (오해 방지)

C1은 "TWA 관련 측정"에 영향을 주지만, **모든 게 망가지는 건 아닙니다.** 정확한 영향 범위:

| 무엇 | C1 영향 | 이유 |
|------|---------|------|
| baseline "TWA 가입자 수" | ❌ **과소(확정)** | `sign_up.browser_env`로 카운트, OAuth 후 referrer 소실 |
| 게이트 실험 **가입자 분류** | ✅ 무관 (정확) | `twa_gate_variant`로 분류 (커밋 48939bd가 보호) |
| 게이트 실험 **재방문 분자** | ⚠️ 제한적 영향 | `page_view.browser_env` 사용. 단 재방문=앱 콜드스타트라 referrer 살아있을 가능성 높음 |
| `User.signupSource` | ❌ 오염 가능 | login 이벤트 시점도 referrer 소실 후 |

> 근본 맥락: 커밋 `245b2ce`("PWA TWA misclassify")가 PWA를 TWA로 오분류하던 걸 막으려 `getBrowserEnv`의 standalone 라인을 **의도적으로 제거**한 트레이드오프. 단순 버그가 아님. `useAppEnvironment.isTWA`만 sticky를 봐서 게이트 노출은 강건하지만, 이벤트 기록용 `getBrowserEnv`는 취약.

---

## ⏸️ 창업자 결정 대기

| 항목 | 내용 |
|------|------|
| **앱 설치 유도 ON** | `NEXT_PUBLIC_PWA_INSTALL_ENABLED` 현재 OFF (Vercel). 켜면 AddToHomeScreen 팝업/배너/footer/inline 설치 유도 작동. "지금은 보류" 결정 상태 → 켤지/계속 보류할지 |

---

## ✅ 해결됨 (이력)

| ID | 내용 | 해결 경위 |
|----|------|----------|
| C3 | 어드민 A/B 전환율 "근사치" 라벨 | bd3d58a(게이트 표 N/M명 병기·모집단 각주) + 배너 funnel은 실험 종료(9dca8fe)로 카드 소멸 |
| C4 | SignupPromptBanner가 SSOT 미사용(자체 variant 함수 중복) | 실험 종료(9dca8fe)로 `getOrAssignVariant`/`getTriggerVariant` 삭제 |

---

## 검수 신뢰성 메모

- 이 목록은 **2개 AI 세션 교차검증** 결과. 1차 세션이 ① 실재 커밋(245b2ce·48939bd)을 "환각"으로 오판 ② C1의 게이트 재방문 영향을 과소평가한 것을 2차에서 정정.
- 교훈: 커밋 존재 확인은 `git log -20`(부분) 말고 `git show`/`git cat-file`로.
- 관련 전체 그림: [channel-architecture.html](../channel-architecture.html) (웹/PWA/TWA 채널 지도)
