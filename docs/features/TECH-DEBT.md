# 기술 부채 추적 (TECH-DEBT)

> 채널(웹/PWA/TWA)·실험 정밀 분석 + 2개 AI 세션 교차검증으로 확정한 부채 목록.
> 최초 정리: 2026-06-09 | 단일 진실 = 이 문서. (plan 임시파일 아님)
> 코드가 바뀌면 이 문서도 갱신(feature-lifecycle). 항목 해결 시 "해결됨"으로 이동.

---

## 🔴 미해결 부채 (우선순위순)

| ID | 우선 | 한 줄 증상 | 근본 원인 (파일) | 근본 해결책 | 상태 |
|----|------|-----------|----------------|------------|------|
| **C6** | ⚪ Low | "일자리 알림 받을래요?" 푸시가 영영 안 뜸 | `setPushToastTrigger('job')` 호출처 0 (UI·메시지는 완비. comment·post·signup·visit 트리거는 연결됨, `'job'`만 미연결) | jobs 페이지/저장 시점에 `setPushToastTrigger('job')` 연결 | 미착수 |

---

## C1 상세 — 영향 분해 (오해 방지)

C1은 "TWA 관련 측정"에 영향을 주지만, **모든 게 망가지는 건 아닙니다.** 정확한 영향 범위:

| 무엇 | 취약도 | 이유 |
|------|---------|------|
| baseline "TWA 가입자 수" (getTwaSignupRetention:198) | 🔴 **가장 취약** | `sign_up.browser_env` **단독, referrer 백업 없음** → 최약점 |
| 게이트 **재방문 분자** (getGateRetention:294) | 🟡 제한적 | `page_view.browser_env`. 단 D1/D7은 가입 1h 후부터 = 앱 콜드스타트라 referrer 생존 가능성 높음 |
| `User.signupSource` (route.ts:76) | 🟡 **덜 취약** | `browser_env \|\| referrer` **이중 판정** — browser_env 오염돼도 `ref.startsWith('android-app://')` 백업으로 TWA 잡힘. baseline보다 강건 |
| 게이트 **가입자 분류** (분모) | 🟢 무관 | `twa_gate_variant`(localStorage sticky, 48939bd 보호) |

> 정정 이력: 이 표의 `signupSource`는 2차 검수에서 baseline과 동급 `❌`로 과대 표기했으나, 3차 교차검증에서 route.ts:76의 **referrer 백업 이중판정**을 확인해 🟡(덜 취약)로 정정. **C1의 진짜 최약점은 baseline 가입자수**(백업 없는 유일한 집계).

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
| C2 | TWA 게이트 긴급 OFF 스위치 마련 | 2026-06-09: `TwaEntryGate`에 `NEXT_PUBLIC_TWA_GATE_ENABLED==='false'` 가드 추가(미설정=ON, **현재 동작 무변경**). 끄려면 Vercel서 `='false'`. 죽은 `flags.twa`(non-public이라 클라이언트서 무용)는 제거 |
| C5 | 죽은 FEATURE_* 정리 | 2026-06-09: `env.ts` export 3개 + `feature-flags.ts` twa 제거 + `.env.example`서 FEATURE_TWA 제거(FEATURE_PUSH_TOAST·WEB_PUSH는 사용 중이라 유지) |
| C1 | TWA 측정 sticky 보강 | 2026-06-09: `getBrowserEnv`에 `_twa_confirmed` sticky 반영 → referrer 소실(OAuth 복귀)에도 twa-android 유지. baseline·재방문·signupSource 누락 방지(useAppEnvironment.isTWA와 동일 신호). **프로덕션 network 실측 검증 완료** — referrer 소실 상황(referrer=자사도메인)에서 page_view.browser_env=`twa-android` 확인 |
| C7 | detectEnv↔getBrowserEnv 역할 명확화 | 2026-06-09: 완전 통합 대신(순환의존·역할 차이) 양쪽 주석으로 역할 분리 명시 — getBrowserEnv=분석(twa+sticky), detectEnv=설치유도(상위 isTWA 가드 보호) |

---

## 검수 신뢰성 메모

- 이 목록은 **3개 AI 세션 교차검증** 결과.
  - 1차: ① 실재 커밋(245b2ce·48939bd)을 "환각"으로 오판 ② C1 게이트 재방문 영향 과소평가 → 2차에서 정정.
  - 3차(마스터 검수): signupSource를 baseline과 동급 ❌로 과대 표기한 것을 정정 → route.ts:76 referrer 백업 이중판정으로 🟡(덜 취약). C3 무해 근거도 정밀화(웹 펀넬 실험 0개라 `_getWebExperiments` rate가 화면 미노출).
- 교훈: 커밋 존재 확인은 `git log -20`(부분) 말고 `git show`/`git cat-file`로. 누적 plan 문서는 실험 제거 등 큰 변경 전후 섹션이 모순되니 stale 주의.
- 관련 전체 그림: [channel-architecture.html](../channel-architecture.html) (웹/PWA/TWA 채널 지도)
