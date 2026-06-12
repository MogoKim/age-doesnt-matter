# 푸시 알림 권한 수집 — 설계 명세서 (Design Spec)

> **상태**: 기획·설계 확정. **코드 미착수.** 구현 전 최종 검토용.
> **정책 본문**: [push-permission-policy.md](./push-permission-policy.md) (이 문서는 그 정책을 "어떻게 코드로 구현하는가"의 설계서)
> **목표**: 구독자 0 → 확보. 발송 파이프(이미 작동)를 켠다. 타겟 40·50·60대 여성.
> **원칙**: DB·서버·인증·스키마 **무변경**. 클라이언트 4파일만. 버그·회귀 0.

---

## 0. Executive Summary

| 항목 | 내용 |
|---|---|
| 무엇 | ① 구독 수집(토스트 트리거 확장) + ② **광고/마케팅 발송 컴플라이언스**(동의·(광고)표기·야간제한) |
| 왜 | 푸시 완비인데 **구독자 0명** + **창업자가 광고 푸시 발송 의도** → 구독 모으고 합법적으로 광고 발송 |
| 건드릴 파일 | **A. 수집(클라 4)**: PushPermissionToast(주)·Onboarding·PostWrite·PostViewBeacon. **B. 광고 컴플라이언스(서버 3~4)**: pushService.ts(category)·admin/push/actions.ts(UI·필터)·신규 마케팅동의 기록 액션·(선택)설정 토글 |
| 안 건드림 | 서비스워커·VAPID·스키마(필드 이미 존재)·auth·middleware |
| 롤백 | `FEATURE_PUSH_TOAST=false`(수집 off) / `FEATURE_WEB_PUSH=false`(발송 off) |
| 위험도 | 수집=🟢. **광고 발송=🟡** (법 규제 준수 구현 필요: (광고)표기·야간·동의필터). **동의 묶음은 법무 확인 완료**(2026-06-12). TWA 실제 전달은 실기기 검증 |
| ⚖️ 법적 | 광고성 푸시 = **정보통신망법 제50조** (사전동의·(광고)표기·야간 21~08 제한·수신거부). 아래 §7.5 설계 반영. **나는 변호사 아님 → 발송 전 법무 확인** |

---

## 1. 현재 시스템 (코드 직접 확인 — file:line)

| 요소 | 위치 | 상태 |
|---|---|---|
| 권한 토스트 | `src/components/common/PushPermissionToast.tsx` | ✅ pre-permission 패턴(네 탭 시에만 OS 프롬프트) |
| 트리거 설정 함수 | 同 파일 `setPushToastTrigger(type)` (108줄) → `sessionStorage['push_toast_trigger']` | ✅ |
| 현재 유일 트리거 | `CommentInput.tsx:37` `setPushToastTrigger('comment')` | ⚠️ 이것뿐 → 구독 0 원인 |
| 쿨다운 | `src/lib/push/permission.ts` `canAskPushPermission/recordDenied/recordGranted` | ✅ 1일/30일 |
| 환경 감지 | `src/hooks/useAppEnvironment.ts` `supportsWebPush=('PushManager' in window)` | ✅ useMemo([]) 1회 |
| 구독 저장 | `POST /api/push/subscribe` (auth 필수, userId 귀속, upsert) | ✅ `route.ts:10-26` |
| 발송 | `pushService.notify` ← `notifyUser`(notify.ts) ← 댓글/답글(comments.ts:121,131)·등급(grade.ts:52)·비회원댓글(guest-comments.ts:97)·어드민(admin/push) | ✅ flags.webPush 게이트 |
| 마운트 | `(main)/layout.tsx:47` `<PushPermissionToast/>` (ssr:false) — (main) 전 페이지 상주 | ✅ |
| 세션 | `AuthProvider(SessionProvider)` 루트 래핑 `layout.tsx:102` → 토스트에서 `useSession` 가능 | ✅ |
| 정독 신호 | `PostViewBeacon.tsx:51-53` `sessionStorage['twa_session_post_views']++` | ✅ 재사용 |
| DB 모델 | `PushSubscription`(endpoint @unique, userId, p256dh, auth) `schema.prisma:1064` | ✅ |
| VAPID | `.env.local` 4키(SUBJECT/PUBLIC/PRIVATE/NEXT_PUBLIC_*) | ✅ |

**현재 구독자 수: 0 / 온보딩 완료 실유저 94** (DB 실측 2026-06-12).

---

## 2. 트리거·문구 매핑 (확정)

> **변경(광고 발송 반영)**: "광고 안 보내요"는 **거짓이 되므로 전면 삭제**. 대신 **"우나어 소식·혜택"을 명시**(informed consent). "좋아요" 탭 = 푸시 허용 + **마케팅 수신 동의**(§7.5).

| 우선순위 | type | 발동 코드 위치 | 메인 | 서브 |
|---|---|---|---|---|
| 1 | `post` | PostWriteForm 작성성공(신규만) | 🔔 답글 오면 바로 알려드릴까요? | 우나어 소식·혜택도 함께 · 언제든 끄기 |
| 1 | `comment` | CommentInput(기존) | 🔔 답글 오면 바로 알려드릴까요? | 우나어 소식·혜택도 함께 · 언제든 끄기 |
| 2 | `visit` | 토스트 내부 자동(정독 1회 후) | 🔔 내 글 소식, 알림 받으시겠어요? | 답글·소식·혜택 · 언제든 끄기 |
| 3 | `signup` | OnboardingForm.handleComplete | 🌱 환영해요! 알림 받으시겠어요? | 답글·새 소식·혜택 · 언제든 끄기 |

- 버튼 공통: **[받을게요]** / [나중에]
- `comment` 문구도 기존("누군가 답변을…")에서 위로 교체.
- **메인은 짧은 훅 1줄, 서브에 "소식·혜택" 명시** → "받을게요"가 곧 마케팅 동의 근거(법적 informed consent).

---

## 3. 키 레지스트리 (state 충돌 방지 — 전부 명시)

| 키 | 저장소 | 의미 | 소유 |
|---|---|---|---|
| `push_toast_trigger` | sessionStorage | 명시 트리거(post/comment/signup) 1회성 | 기존+확장 |
| `push_visit_shown` | sessionStorage | 자동 visit 세션당 1회 가드 | **신규** |
| `twa_session_post_views` | sessionStorage | 정독 카운트(visit 발동 조건) | 기존(PostViewBeacon) |
| `pwa_shown_this_session` | sessionStorage | PWA 설치팝업 표시중(=토스트 숨김) | 기존(POPUP_VISIBLE_KEY) |
| `push_granted` | localStorage | 허용됨(영구 비표시) | 기존(permission.ts) |
| `push_denied_count`/`push_denied_at` | localStorage | 거절 횟수/시각(쿨다운) | 기존 |
| `_twa_confirmed` | localStorage | TWA sticky | 기존 |

> 신규 키는 `push_visit_shown` **단 1개**. 나머지 전부 재사용.

---

## 4. 컴포넌트 설계 — `PushPermissionToast.tsx`

### 4-1. 의존성 추가
- `useSession()` 추가(회원 판별). `status==='loading'`이면 보류.
- 기존 `useAppEnvironment()`(supportsWebPush), `canAskPushPermission()`, `flags.pushToast` 유지.

### 4-2. 노출 적격 함수 (eligible) — AND 전부
```
eligible():
  flags.pushToast === true
  && env.supportsWebPush === true
  && session.status === 'authenticated'   // 로그인 회원 (비회원·로딩 제외)
  && canAskPushPermission() === true       // 미허용 + 미차단 + 쿨다운 경과
  && !sessionStorage['pwa_shown_this_session']  // PWA팝업 미표시
```

### 4-3. 발동 로직 (state machine) — ⚠️ #1 수정 반영 (CRITICAL)

> **왜 수정**: 토스트는 (main) 레이아웃 상주 → **마운트 1회뿐**(deps `[env.supportsWebPush]` 불변). 글쓰기·글상세 둘 다 (main) 안이라 `router.push`로 **재마운트 안 됨**, 댓글은 같은 페이지 → sessionStorage trigger의 **"읽는 시점"이 안 옴** → ③post·comment **영원히 안 뜸**. (초기 스펙의 "sessionStorage라 나중에 읽힘 🟢" = **오판**. 현재 구독 0의 진짜 원인.)
> **해결**: 명시 트리거도 **window 이벤트로 재평가**(visit의 `unao:engaged`와 동일 패턴).

```
evaluate()  ── 재호출 가능 함수
  if (visible || 이미 show 가드) return
  if (!eligible()) return
  // (A) 명시 트리거
  t = sessionStorage['push_toast_trigger']
  if (t in ['post','comment','signup']):
     sessionStorage.remove('push_toast_trigger'); show(t); return
  // (B) 자동 visit — 명시 없고 push_visit_shown 아니고 정독≥1
  if (!sessionStorage['push_visit_shown'] && Number(sessionStorage['twa_session_post_views']||0) >= 1):
     sessionStorage['push_visit_shown']='1'; show('visit')

evaluate() 호출 시점 (4곳):
  1. 마운트 1회            — 직접 진입/리로드 커버 (sessionStorage 폴백)
  2. window 'unao:push-trigger' — setPushToastTrigger가 dispatch ★#1 핵심: 같은 페이지/(main) 내 네비 후에도 즉시 평가
  3. window 'unao:engaged'       — 정독 시 visit 재평가
  4. session.status 변경
```
- `show(type)`: `setTrigger(type)`; `setTimeout(()=>setVisible(true), 500)`; `trackEvent('push_prompt_shown',{trigger:type})`.
- **한 번에 하나만**: `visible` 또는 show 가드 시 무시.
- `setPushToastTrigger(type)` 수정: sessionStorage 쓰기 **+ `window.dispatchEvent(new CustomEvent('unao:push-trigger'))`** (PushPermissionToast.tsx 내 정의 — 같은 파일 수정).

### 4-4. handleAllow / handleLater (기존 유지 + 측정)
- `handleAllow`(기존 38-66줄 그대로) 끝에 성공 시 `trackEvent('push_prompt_allowed',{trigger})`, 권한 거부 시 `recordDenied()` + `trackEvent('push_prompt_denied',{trigger,reason:'blocked'})`.
- `handleLater`(기존) `recordDenied()` + `trackEvent('push_prompt_denied',{trigger,reason:'later'})`.
- **변경 없음 핵심**: 구독 생성·POST·VAPID 변환 로직 일절 손대지 않음.

### 4-5. 메시지 맵 (TriggerType 확장)
`type TriggerType = 'comment'|'job'|'signup'|'post'|'visit'`. 메시지/서브 §2 표대로. (`job`은 기존 보존)

---

## 5. 나머지 3파일 (각 1줄)

| 파일 | 변경 | 위치 |
|---|---|---|
| `OnboardingForm.tsx` | `handleComplete()`에 `setPushToastTrigger('signup')` 추가(기존 `signup_completed_at` 세팅·`router.push('/')` 사이) | `handleComplete` 내부 |
| `PostWriteForm.tsx` | 작성 성공 분기(`!result.error`)에서 **신규일 때만**(`!isEditMode`) `setPushToastTrigger('post')` | `:327-332` 사이 |
| `PostViewBeacon.tsx` | 정독 카운트 증가 직후 `window.dispatchEvent(new CustomEvent('unao:engaged'))` 1줄 | `:53` 직후 |

- import: `setPushToastTrigger`는 `@/components/common/PushPermissionToast`에서. (CommentInput.tsx:7과 동일 패턴)

---

## 5.5 광고/마케팅 발송 컴플라이언스 (NEW — 광고 발송 위함)

> ⚖️ 광고성(영리 목적) 푸시는 **정보통신망법 제50조** 대상. 아래는 일반 요건 반영. **발송 전 법무 최종확인 권장**(나는 변호사 아님).

### (0) "권한(기술)" vs "동의(법)" 구분 — 헷갈림 방지
| 메시지 | ① OS 푸시 권한(구독) | ② 마케팅 동의(법) |
|---|---|---|
| 정보성/서비스(답글·등급) | ✅ 필요(기술) | ❌ 불필요 |
| 광고성(혜택·이벤트) | ✅ 필요 | ✅ 필요(§50) |
| 앱 안 종(🔔) 알림 | ❌ 불필요 | ❌ 불필요 |

- 정보성도 **"폰 OS 푸시"로 보내려면 ①(권한/구독)은 필수** — 권한 없이 폰 알림 못 띄움. ②(마케팅 동의)만 정보성엔 면제.
- "받을게요" = ①+② 동시 획득(법무 확인 완료). 경계 메시지("오랜만이에요~")는 광고로 보고 ② 동의자에게만.

### (1) 동의 모델 — informed consent
- 토스트가 **"우나어 소식·혜택"을 명시** → "좋아요" 탭 = 푸시 허용 + **명시적 마케팅 수신 동의**.
- "좋아요" 성공 시: 구독 저장(기존) + **동의 기록** = `User.marketingOptIn=true` + `Agreement(type=MARKETING, version, agreedAt=now)` upsert. **동의 시각 = 법적 증빙.**
- 구현: 신규 서버액션 `recordPushMarketingConsent()`(토스트 handleAllow 성공 직후 호출) **또는** `/api/push/subscribe`에 동의기록 통합. → **DB write 1건 추가**(필드·테이블 이미 존재, 스키마 무변경).
- ⚠️ **#3 version 단일화**: `Agreement @@unique([userId,type,version])`. 온보딩은 `version='1.0'`(onboarding.ts:79). recordPushMarketingConsent도 **동일 version 사용**(공용 `MARKETING_AGREEMENT_VERSION` 상수로 추출) → 같은 사용자 MARKETING row **중복 누적 방지**(다른 version 쓰면 row 2개). upsert 키 일치.
- 온보딩에서 이미 동의한 사람은 유지. 미동의자가 여기서 동의하면 갱신(후속 동의가 이전 거부에 우선 — 시각 기록).

### (2) 발송 분리 — `pushService.notify` 확장
- 시그니처: `notify(userId, payload, campaign, category?: 'service'|'ad')` (기본 `'service'`).
- **service** (댓글·답글·등급): 규제 무관 → 푸시 허용자 전원. 기존 호출부 무변경(기본값).
- **ad** (혜택·이벤트·공지):
  1. 수신자 `marketingOptIn === true` 아니면 **스킵** (발송함수 내 가드 = 이중 안전).
  2. 제목 앞 **`(광고)`** 자동 prefix (이미 있으면 중복 안 붙임).
  3. **야간 21:00~08:00 KST 차단** — 그 시간대 광고는 미발송(별도 야간동의 없음).
  4. 수신거부 경로 — 알림 클릭 시/또는 body에 "알림 끄기: 설정" 안내.

### (3) 어드민 브로드캐스트 (`adminBroadcastPush`)
- "유형: **서비스 / 광고**" 선택 추가.
- 광고 선택 시: `where`에 **`marketingOptIn: true`** 추가 + `category='ad'`(=(광고) prefix + 야간 차단) + 대상 수 "마케팅 동의자 N명" 표시.
- 현재 `where: { status:'ACTIVE', ...grade }` → 광고면 `marketingOptIn:true` 결합.

### (4) 수신거부
- 기존 `DELETE /api/push/subscribe`(전체 끄기). + (선택) 설정에 "마케팅 알림만 끄기" = `marketingOptIn=false` 토글.

### (5) DB 영향
- write 추가: `User.marketingOptIn` 갱신 + `Agreement(MARKETING)` upsert. **스키마 변경 0** (enum·필드 이미 존재: `AgreementType.MARKETING`, `User.marketingOptIn`).

---

## 6. 리스크 헤징 — 엣지케이스 전수 (구멍 0 점검)

| # | 상황 | 위험 | 설계상 처리 | 판정 |
|---|---|---|---|---|
| 1 | **가입 토스트 무시 후 글쓰기** | signup이 ③를 잡아먹나? | "무시"는 거절 아님(쿨다운 0). 단 토스트는 하단 상주라 화면에 남음 → 사용자가 결국 탭. **한 번에 1개**라 ③는 같은 토스트가 이미 표시중이면 무시. 탭(나중에)하면 쿨다운→③ 안뜸(='no' 존중, 올바름). 탭(좋아요)하면 구독완료→③ 불필요 | 🟢 의도된 동작 |
| 2 | 비회원 | 구독 API 401·푸시 타겟 불가 | `session.status==='authenticated'` 게이트 → 비회원 토스트 미노출. 가입배너가 담당 | 🟢 |
| 3 | session 로딩중 | 깜빡임/오판 | `status==='loading'` 보류. status 확정 후 재평가(deps) | 🟢 |
| 4 | 이미 허용/브라우저 차단 | 재요청·영구차단 | `canAskPushPermission()` false(granted/denied) → 미노출 | 🟢 |
| 5 | 쿨다운 중 | 도배 | `canAskPushPermission()` 1일/30일 → 모든 트리거 공통 차단 | 🟢 |
| 6 | iOS 사파리 미설치 | PushManager 없음 | `supportsWebPush` false → 자동 미노출(graceful) | 🟢 |
| 7 | 카톡/네이버 인앱 | 푸시 미지원 | 同上 supportsWebPush false | 🟢 |
| 8 | PWA 설치팝업과 충돌 | 동시 2개 | `pwa_shown_this_session` 있으면 토스트 숨김(기존) | 🟢 |
| 9 | visit 반복 노출 | 매 페이지/리로드 재발 | `push_visit_shown`(세션) + ref 1회가드 + 정독≥1 조건 | 🟢 |
| 10 | visit 너무 차가움(홈 진입 즉시) | 거부감 | **정독 1회 후**에만(`twa_session_post_views≥1` + `unao:engaged`) | 🟢 |
| 11 | 명시 트리거 중복 발사(글 3개 연속) | 토스트 3번 | 트리거는 sessionStorage 1회성 소비 + visible 1개 + 쿨다운. 첫 1회만, 이후 쿨다운/granted | 🟢 |
| 12 | SSR/hydration | 서버-클라 불일치 | 컴포넌트 ssr:false + 모든 판단 useEffect(클라전용). 토스트는 hydration 후에만 | 🟢 |
| 13 | **(main) 내 명시 트리거 미발화 (CRITICAL — 초기 오판)** | 상주라 마운트 1회 → sessionStorage "읽는 시점" 안 옴 → ③post·comment **안 뜸**(현재 구독 0 진짜 원인) | `setPushToastTrigger`가 **`unao:push-trigger` 이벤트 dispatch** + 토스트 `evaluate()` 리스너 재평가(visit `unao:engaged`와 동일). sessionStorage 폴백 병행. §4-3 | 🔴→🟢 |
| 14 | 편집(글 수정) 시 post 트리거 오발동 | 수정인데 "방금 쓰신 글" | `!isEditMode` 가드 → 신규 작성만 | 🟢 |
| 15 | VAPID 키 없음 | subscribe 실패 | 기존 handleAllow가 `if(!vapidKey) return` (51줄). env엔 설정됨 | 🟢 |
| 16 | 구독 POST 401(세션만료) | 저장 실패 | 기존 try/catch 무시(UI 영향 0). 다음 기회 재시도 | 🟢 |
| 17 | localStorage/sessionStorage 불가 환경 | 예외 | 모든 접근 try/catch(기존 패턴) | 🟢 |
| 18 | TWA 실제 알림 전달 | 코드는 OK나 wrapper 위임 설정 의존 | ⚠️ **실기기 검증 필수**(헤드리스 불가) | 🟡 검증 |
| 19 | 기존 'comment' 트리거 회귀 | 문구·동작 변경 | type/메시지만 확장, 발동 경로 동일. CommentInput 무변경 | 🟢 |
| 20 | 측정 이벤트 오염 | EventLog 적재↑ | trackEvent 3종(shown/allowed/denied), 봇 자동제외(기존), retention 크론 관리 | 🟢 |
| **21** | **동의 안 한 사람에게 광고** | 법 위반 | `marketingOptIn=true` 필터 **이중**(admin where + notify ad 가드) | 🟡→🟢 |
| **22** | **(광고) 표기 누락** | 법 위반 | ad category에서 제목 prefix 자동(중복가드) | 🟡→🟢 |
| **23** | **야간(21~08) 광고 발송** | 법 위반 | ad 발송함수 KST hour 가드 → 차단 | 🟡→🟢 |
| **24** | **동의 증빙 부재** | 분쟁 시 불리 | "좋아요" 시 `Agreement(MARKETING, agreedAt)` upsert(시각 기록) | 🟢 |
| **25** | 묶음 동의(서비스+마케팅) 유효성 — 온보딩 분리 vs 토스트 묶음 모순 | 다크패턴·동의무효 소지 | **법무 확인 완료 → 묶음 진행 OK**(창업자 확인 2026-06-12). "소식·혜택" 서브 명시 + 동의 시각 기록 | 🟢 |
| **26** | service 알림에 (광고) 오부착 | 서비스 알림 변질 | category 기본 'service' → prefix·필터 미적용. ad는 명시 호출만 | 🟢 |

---

## 7. 회귀 영향 격리 (전수)

| 확인 | 결과 |
|---|---|
| PushPermissionToast 사용처 | (main)/layout 1곳 → 다른 페이지 영향 없음 |
| setPushToastTrigger 기존 호출(CommentInput) | 시그니처 동일(타입만 확장) → 무영향 |
| PostViewBeacon 사용처 | 글 상세 1곳. 이벤트 dispatch 1줄 추가는 부수효과 없음(리스너 없으면 no-op) |
| OnboardingForm handleComplete | 기존 로직 사이 1줄 삽입, 순서 영향 없음(sessionStorage 쓰기만) |
| PostWriteForm 성공분기 | 기존 gtm/track 옆 1줄, router.push 전 |
| 발송/스키마/auth | 무접촉 |

---

## 8. 측정 (구독률·효과)

- 신규 eventName: `push_prompt_shown` / `push_prompt_allowed` / `push_prompt_denied` — properties `{trigger}`(+denied시 reason).
- 핵심 KPI: **DB `PushSubscription` 행 수**(0→증가) = 구독률.
- 트리거별 전환: shown 대비 allowed 비율 → 어느 트리거(③/②/①)가 잘 먹히는지.
- (Phase 2) 발송 클릭률 → 리텐션 기여.

---

## 9. 검증 계획 (구현 후)

1. **정적**: `npx tsc --noEmit` + `npm run build` + ESLint.
2. **로컬 E2E**(민팅 세션 + Playwright, context permissions 'notifications' grant, dev는 DIRECT_URL→pooler 우회):
   - 신규: 온보딩 step3 "시작하기" → 홈에서 `signup` 토스트(🌱 환영) 노출.
   - 기존회원: 로그인 세션 + 글 1개 열람(`unao:engaged`) → `visit` 토스트 자동 노출. 홈 진입 즉시엔 안 뜸 확인.
   - **★#1 글쓰기: 새 글 작성 성공 → `router.push`로 글상세((main)내) 이동 후에도 `post` 토스트 정상 노출**(이벤트 재평가 동작 확인 = 이 케이스가 핵심). 수정 시 미노출.
   - **★#1 댓글: 같은 글상세 페이지에서 댓글 작성 → 페이지 이동 없이 `comment` 토스트 노출**(현재 안 뜨던 버그가 고쳐졌는지 = 회귀 검증).
   - "좋아요" → `/api/push/subscribe` 204 + DB `PushSubscription` 1행 + **`marketingOptIn=true`·`Agreement(MARKETING)` 기록 확인**(테스트 후 정리).
   - "나중에" → 같은 세션 재노출 0 + `push_denied_at` 기록(쿨다운).
   - 비회원 세션 → 어떤 트리거도 미노출.
2.5. **광고 발송 컴플라이언스 단위검증**(read-only/스테이징):
   - 광고 브로드캐스트 → `marketingOptIn=false` 유저는 **수신 0**(스킵) 확인.
   - 제목에 **`(광고)` 자동 부착** 확인.
   - **야간(21~08 KST)** 광고 발송 → **차단** 확인. 주간은 정상.
   - service 알림(댓글)은 (광고) 미부착·전원 발송 확인.
3. **실기기(필수)**: 갤럭시 TWA + 아이폰 설치PWA → 토스트→좋아요→허용→**어드민 브로드캐스트로 실제 알림 1건 수신**. AUTH_FAILURE 0 유지.
4. **프로덕션 모니터링**: 배포 후 `PushSubscription` 행 증가 추이 + `push_prompt_*` 이벤트 적재.

---

## 10. 롤백 / 안전장치

- `FEATURE_PUSH_TOAST=false`(Vercel env) → 토스트 전체 즉시 off(재배포 불필요, flags.pushToast).
- `FEATURE_WEB_PUSH=false` → 발송 off(구독은 유지).
- 코드 4파일 모두 클라이언트 → 서버/DB 무영향. git revert로 즉시 원복.

---

## 11. 범위 / 비범위

**포함(이번)**: 구독 수집(토스트 트리거 4) + **광고 컴플라이언스**(동의기록·pushService ad category·어드민 광고 발송 UI·(광고)표기·야간제한·marketingOptIn 필터).

**비범위(제외)**:
- ❌ 새 글/좋아요/스크랩 **자동** 푸시(남발 방지) — 광고는 어드민이 수동 브로드캐스트
- ❌ 재참여 자동 스케줄/세그먼트 자동화 = Phase 2
- ❌ 서비스워커·VAPID·DB **스키마**·auth·middleware 변경 (marketingOptIn/Agreement는 기존 필드 write만)
- ❌ "알림을 켰어요 ✅" 확인 토스트 = 선택

---

## 12. 구현 체크리스트 (착수 시 순서)

**A. 구독 수집 (클라)**
1. `PushPermissionToast.tsx` — TriggerType 확장 + 메시지맵(소식·혜택) + useSession + eligible() + **재호출 `evaluate()`** + `push_visit_shown` + **리스너 2종(`unao:push-trigger`★#1 + `unao:engaged`)** + **`setPushToastTrigger`에 `dispatchEvent('unao:push-trigger')` 추가** + 측정 3이벤트 + handleAllow 성공 시 `recordPushMarketingConsent()` 호출.
2. `PostViewBeacon.tsx` — `unao:engaged` dispatch 1줄.
3. `OnboardingForm.tsx` — handleComplete `setPushToastTrigger('signup')`.
4. `PostWriteForm.tsx` — 성공분기 `!isEditMode && setPushToastTrigger('post')`.

**B. 광고 컴플라이언스 (서버)**
5. 신규 `recordPushMarketingConsent()` 서버액션 — `marketingOptIn=true` + `Agreement(MARKETING)` upsert(시각 기록). **version은 온보딩과 공유 상수(`MARKETING_AGREEMENT_VERSION`, 현재 '1.0') — #3 중복 방지**.
6. `pushService.ts` — `notify`에 `category` 파라미터 + ad일 때 marketingOptIn 가드 + (광고) prefix + 야간 21~08 KST 차단.
7. `admin/push/actions.ts` — 유형(서비스/광고) + 광고 시 `marketingOptIn:true` where + `category='ad'` + 대상 수 표시.

**C. 검증**
8. tsc+build → 로컬 E2E(수집) → 광고 발송 단위검증(동의자만/(광고)표기/야간차단) → (배포 후) 실기기 → ⚖️ **법무 확인 후 광고 발송 개시**.
