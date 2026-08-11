---
id: F20
name: 전환 채널 정책 (가입·앱·인앱)
status: ACTIVE
created: 2026-08-11
updated: 2026-08-11
kind: 운영 기준 문서 (policy SSoT)
---

# F20 — 전환 채널 정책 정본

> **이 문서는 기능 명세가 아니라 정책 정본이다.**
> "이 브라우저에서는 가입을 어떻게 유도하는가"가 여기서 정해진다.
> 전환면 코드를 고치기 전에 반드시 이 문서를 먼저 읽는다.
>
> 코드 기준: `origin/main` `c1abb001` (2026-08-11 감사)
> 관련: [F01 가입 배너](F01-signup-prompt.md) · [F02 PWA 설치](F02-pwa-install.md) · [F13 PostCTA](F13-post-cta.md) · [F16 A/B 인프라](F16-ab-test-infra.md) · [F19 비회원 세션 계측](F19-anonymous-session-measurement.md)

---

## 1. 왜 이 문서가 필요한가

우나어의 North Star는 **주간 재방문 참여 유저 수**다. 가입 CTA는 단순한 전환 버튼이 아니라 **댓글·공감·글쓰기·재방문으로 들어가는 입구**다. 그런데 지금 이 입구는 채널마다 다르게 동작한다.

- iOS는 가입만 시킨다.
- Android 외부 브라우저는 A/B 실험 중이다.
- Android 네이버 인앱은 **문구는 가입인데 클릭은 외부 브라우저로 나간다.**
- iOS 네이버 인앱은 카카오 로그인으로 바로 간다.

이게 문서 없이 코드에만 있으면 다음에 개발할 때 **"알고 보니 이 브라우저는 다르게 동작했습니다"** 가 반복된다. 실제로 지난 2주 동안 이 이유로 hotfix가 세 번 나갔다.

**이 문서의 역할은 세 가지다.**
1. 채널별 현재 정책을 한 장으로 보여준다.
2. **실험 중인 대상**과 **단독으로 바꿔도 되는 대상**을 갈라 놓는다.
3. 다시 나오면 안 되는 문구·UX를 못 박는다.

---

## 2. 먼저 알아야 할 것 — 채널을 판정하는 함수가 **세 개**다

같은 브라우저를 세 곳에서 각각 판정한다. 값이 미묘하게 다르고, **이게 지금까지 사고의 주된 원인이다.**

| 판정기 | 위치 | 쓰이는 곳 | 특징 |
|---|---|---|---|
| `detectEnv()` | `src/components/common/AddToHomeScreen.tsx` | **배너 CTA 문구·클릭 경로**, PostCTA 설치 차단 | 화면 폭 ≥1024px면 무조건 `desktop`. 마지막이 `android-chrome` **catch-all** |
| `getBrowserEnv()` | `src/lib/gtm.ts` | **이벤트 기록용 채널값**(`browser_env`) | `detectEnv`와 거의 같지만 **`twa-android`를 추가로 구분** |
| `browser-env.ts` 함수군 | `src/lib/browser-env.ts` | **A/B 실험 세그먼트 판정** | UA만 보는 순수 함수. `Android 여부`를 양성 확인하고 인앱·WebView를 배제 |

> ⚠️ **`detectEnv`와 `browser-env`는 목적이 다르다.** 전자는 "무슨 안내를 보여줄까", 후자는 "실험 분모에 넣을까"다. 통합하면 편해 보이지만 **지금 통합하면 실험 분모가 흔들린다**(§7-D 참조).

### 판정 순서 (`detectEnv` / `getBrowserEnv` 공통)

```
1) 화면 폭 ≥ 1024px          → desktop
2) UA에 KAKAOTALK            → kakao-android / kakao-ios
3) UA에 NAVER(inapp 또는 NaverSearchApp → naver-inapp   ← OS를 구분하지 않는다
4) UA에 Instagram|FBAN|FBAV  → instagram-inapp
5) UA에 GSA/                 → google-inapp
6) UA에 CriOS                → crios
7) UA에 iphone|ipad|ipod     → ios-safari
8) 그 외 전부                → android-chrome          ← catch-all
```

**여기서 나오는 두 가지 함정을 기억해야 한다.**
- **카카오는 OS를 쪼개는데 네이버는 안 쪼갠다.** `naver-inapp` 하나로 iOS·Android가 같이 들어온다. 그래서 배너는 별도의 `isIOS`(UA 기반)로 iOS를 다시 갈라낸다.
- **다음(Daum) 인앱은 `detectEnv`에 아예 없다.** catch-all에 걸려 `android-chrome`으로 분류된다. (실험 판정기는 `daum`을 인식해 제외하므로 결과적으로 실험에는 안 들어간다 — §6 불일치 참조)

### 배너 CTA를 결정하는 실제 조건

```
CTA 문구 = isIOS        → "카카오로 1초 가입"        (IOS_SIGNUP_CTA)
          inapp        → "카카오로 가입하기"        (inappCtaText)
          그 외        → "카카오 한 번 클릭으로 가입" (BANNER_CONTENT.cta)
          실험 대상    → variant 문구가 위를 덮어씀

클릭 경로 = isIOS 먼저 검사 → 카카오 OAuth 직행 (여기서 return)
           inapp        → 외부 브라우저 intent
           그 외        → 카카오 OAuth 직행
```

- `isIOS`는 UA에 `iPhone|iPad|iPod`가 있는지로만 본다(`isIOSUserAgent`).
- `inapp`은 `INAPP_ENVS = [kakao-android, kakao-ios, naver-inapp, google-inapp]`에 들어가는지로 본다.
- **`instagram-inapp`은 이 목록에 없다.** 그래서 Instagram/Facebook 인앱은 배너 입장에서 "인앱이 아니다"(§6 참조).

---

## 3. 채널별 정책 표

> 읽는 법: **"무엇을 유도하는가"** 열이 정책의 핵심이다. 나머지는 그 근거다.
> `PWA 안내` 열의 "차단"은 코드상 차단이고, 현재는 그와 별개로 **기능 플래그가 꺼져 있어 전 채널 미노출**이다(§4).

### 3-1. iOS 계열 — **가입만 시킨다**

| 채널 | `detectEnv` | 배너 CTA 문구 | 배너 클릭 | PostCTA(비회원) | PWA 안내 | 실험 | 무엇을 유도하는가 |
|---|---|---|---|---|---|---|---|
| **iOS Naver 인앱** | `naver-inapp` | 💛 카카오로 1초 가입 | **카카오 OAuth 직행** | 1초 만에 가입하기 → OAuth | 차단 | 제외 | **가입** |
| **iOS Kakao 인앱** | `kakao-ios` | 💛 카카오로 1초 가입 | **카카오 OAuth 직행** | 1초 만에 가입하기 → OAuth | 차단 | 제외 | **가입** |
| **iOS Google 인앱** | `google-inapp` | 💛 카카오로 1초 가입 | **카카오 OAuth 직행** | 1초 만에 가입하기 → OAuth | 차단 | 제외 | **가입** |
| **iOS Safari** | `ios-safari` | 💛 카카오로 1초 가입 | **카카오 OAuth 직행** | 1초 만에 가입하기 → OAuth | 플래그 의존 | 제외 | **가입** |
| **iOS Chrome (CriOS)** | `crios` | 💛 카카오로 1초 가입 | **카카오 OAuth 직행** | 1초 만에 가입하기 → OAuth | 차단 | 제외 | **가입** |

**정책 한 줄: iOS는 브라우저·인앱 구분 없이 가입만 시킨다.** 앱 설치·PWA·외부 브라우저 유도는 전부 하지 않는다.

**왜 이렇게 됐나.** iOS에는 우리 앱이 없다. PWA "홈 화면에 추가"는 3단계 수동 안내가 필요한데 그 안내를 띄우던 팝업이 플래그로 꺼져 있어 **눌러도 아무 일도 안 일어나는 헛버튼**이 됐다(F02). 외부 브라우저 유도도 마찬가지로 iOS에는 `intent://`가 없어 클립보드 복사밖에 못 하는데, 그걸 안내로 처리했더니 **사용자가 뭘 해야 할지 몰라 같은 버튼을 7번 눌렀다**(2026-08-10 실측). 그래서 **가입 하나로 통일**했다.

### 3-2. Android 인앱 — **문구는 가입, 실제로는 외부 브라우저로 내보낸다**

| 채널 | `detectEnv` | 배너 CTA 문구 | 배너 클릭 | PostCTA(비회원) | PWA 안내 | 실험 | 무엇을 유도하는가 |
|---|---|---|---|---|---|---|---|
| **Android Naver 인앱** | `naver-inapp` | 💛 카카오로 가입하기 | **Chrome intent** (`?signup=1` 부착) | 1초 만에 가입하기 → **인앱 내 OAuth** | 차단 | 제외 | **가입(외부 브라우저 경유)** |
| **Android Kakao 인앱** | `kakao-android` | 💛 카카오로 가입하기 | **Chrome intent** | 1초 만에 가입하기 → **인앱 내 OAuth** | 차단 | 제외 | **가입(외부 브라우저 경유)** |
| **Android Google 인앱** | `google-inapp` | 💛 카카오로 가입하기 | **Chrome intent** | 1초 만에 가입하기 → **인앱 내 OAuth** | 차단 | 제외 | **가입(외부 브라우저 경유)** |

> ⚠️ **같은 화면의 두 CTA가 서로 다르게 동작한다.** 배너는 외부 브라우저로 내보내고, PostCTA는 인앱 안에서 카카오 로그인을 바로 시작한다. **어느 쪽이 맞는지는 아직 데이터로 정해지지 않았다**(§7-C 후보 3).
>
> 참고로 **인앱 안에서 카카오 가입은 실제로 성립한다**(2026-08-08 실측: 네이버 인앱 UA로 `sign_up` 30일 8건). 즉 "외부 브라우저로 빼야만 가입된다"는 전제는 사실이 아니다.

**intent 경로의 알려진 약점**: `package=com.android.chrome`이 하드코딩돼 있고 `browser_fallback_url`이 없다. **Chrome이 없는 기기에서는 조용히 실패한다.** 올바른 패턴(`S.browser_fallback_url`)은 이미 `src/lib/app-links.ts`에 있지만 배너 쪽은 쓰지 않는다(§7-D).

### 3-3. Android 외부 브라우저 — **A/B 실험 중. 단독 변경 금지**

| 채널 | `detectEnv` | 배너 CTA 문구 | 배너 클릭 | PostCTA(비회원) | PWA 안내 | 실험 | 무엇을 유도하는가 |
|---|---|---|---|---|---|---|---|
| **Android Chrome** | `android-chrome` | variant 문구 또는 💛 카카오 한 번 클릭으로 가입 | OAuth 직행 / **Play스토어**(app_card) | 1초 만에 가입하기 → OAuth | 플래그 의존 | **대상** | **실험 중** (가입 vs 앱) |
| **Android Whale** | `android-chrome` | 동일 | 동일 | 동일 | 플래그 의존 | **대상** | **실험 중** |
| **Samsung Internet** | `android-chrome` | 동일 | 동일 | 동일 | 플래그 의존 | **대상** | **실험 중** |
| **기타 Android 외부 브라우저**<br>(Firefox 등) | `android-chrome` | 동일 | 동일 | 동일 | 플래그 의존 | **대상** | **실험 중** |

**실험 세그먼트 정의**(`isAndroidConversionSegment`): **비회원** + `isAndroidExternalBrowserEnv` = UA에 Android가 있고 · iOS가 아니고 · 인앱브라우저가 아니고 · WebView(`; wv`)가 아니고 · TWA/Capacitor/standalone이 아닐 것.

> ⚠️ **웨일 브라우저 ≠ 네이버 앱 인앱브라우저.** 웨일은 독립 브라우저라 실험에 **포함**되고, 네이버 앱 인앱은 **제외**된다. 이름이 비슷해 자주 헷갈린다. 판정 정본은 `src/lib/browser-env.ts`, 회귀 테스트는 `src/__tests__/browser-env.test.ts`.

### 3-4. 앱·데스크탑 — 배너 자체가 안 뜬다

| 채널 | `detectEnv` | `getBrowserEnv` | 배너 | PostCTA(비회원) | 실험 | 무엇을 유도하는가 |
|---|---|---|---|---|---|---|
| **TWA Android** (Play스토어 앱) | `android-chrome` | **`twa-android`** | **미노출**(`isTWA` 게이트) | 1초 만에 가입하기 → OAuth | 제외 | 가입(PostCTA만) |
| **Capacitor Android** | `android-chrome` | `android-chrome` | **미노출**(`isCapacitor` 게이트) | 1초 만에 가입하기 → OAuth | 제외 | 가입(PostCTA만) |
| **Desktop Chrome/Safari** | `desktop` | `desktop` | 💛 카카오 한 번 클릭으로 가입 → OAuth | 1초 만에 가입하기 → OAuth | 제외 | **가입** |

> TWA·Capacitor는 이미 앱을 쓰는 사용자다. 배너로 또 유도할 이유가 없어 **띠배너를 아예 띄우지 않는다**. 앱 안에서의 가입 유도는 PostCTA가 담당한다.
>
> ⚠️ **`isStandalone`(홈 화면 PWA)은 배너 게이트에 빠져 있다.** 실험 세그먼트에는 들어 있는데 배너 노출 게이트에는 `isLoggedIn || isTWA || isCapacitor`만 있다. 홈 화면에 추가한 PWA 사용자에게는 배너가 뜬다. **의도인지 누락인지 확인된 바 없다**(§7-D).

### 3-5. 기타 인앱 / 알 수 없는 환경

| 채널 | `detectEnv` | 배너에서 인앱인가 | 배너 클릭 | 실험 | 비고 |
|---|---|---|---|---|---|
| **Instagram/Facebook 인앱** | `instagram-inapp` | **아니오** (`INAPP_ENVS` 미포함) | iOS면 OAuth / Android면 **OAuth 직행** | 제외 | §6 불일치 |
| **Daum 인앱** | `android-chrome` (인식 못 함) | 아니오 | OAuth 직행 | 제외(`browser-env`가 인식) | §6 불일치 |
| **Android WebView (`; wv`)** | `android-chrome` | 아니오 | OAuth 직행 | 제외 | 우리 앱 셸이 여기 해당 |
| **UA 없음/이상** | `android-chrome` (catch-all) | 아니오 | OAuth 직행 | 제외 | 봇 트래픽은 `isBot`으로 별도 배제 |

---

## 4. 지금 전 채널에서 꺼져 있는 것 — PWA 설치 안내

`AddToHomeScreen` 컴포넌트 전체가 **`NEXT_PUBLIC_PWA_INSTALL_ENABLED === 'true'`** 일 때만 동작한다. 현재 이 플래그가 꺼져 있어 아래가 **전부 미노출**이다.

- PWA 설치 팝업
- **카카오·네이버·인스타그램 인앱의 "외부 브라우저로 열기" 유도 배너** (3일 쿨다운 로직 포함)

> ⚠️ **플래그를 켤 때 같이 터지는 것**: 저 인앱 유도 배너가 붙이는 `utm_source`와, 배너가 "외부 브라우저에 도착했다"고 인식하는 목록이 **서로 맞지 않는다.**
>
> | 보내는 쪽 (`AddToHomeScreen`) | 받는 쪽 (`INAPP_UTM_SOURCES`) | 매칭 |
> |---|---|---|
> | `kakao_inapp` | `kakao-android` / `kakao-ios` | ❌ |
> | `naver_inapp` | `naver-inapp` | ❌ (언더스코어 vs 하이픈) |
> | `instagram_inapp` | (목록에 없음) | ❌ |
>
> **세 채널 모두 매칭되지 않는다.** 켜는 순간 도착 감지(`inapp_redirect_opened`)와 자동 가입 카운트다운이 전부 불발된다. 켜기 전에 이 표기부터 통일해야 한다.

---

## 5. 계측 — 이벤트가 두 파이프로 갈라져 있다

| 이벤트 | EventLog | GTM(GA4) | 비고 |
|---|---|---|---|
| `signup_banner_eligible` / `_shown` / `_clicked` / `_dismissed` | ✅ | ✅ | `clicked`에 `cta_type`(`kakao_oauth`\|`external_browser`\|`app_install`)·`env` |
| `android_conversion_prompt_exposed` / `_clicked` / `_dismissed` | ✅ | — | 실험 전용 |
| `inapp_redirect_attempted` / `_opened` / `_failed` | ✅ | ✅ | `source`·`channel`·`os`·`ua_class`·`browser_env`·`redirect_method` |
| `post_cta_shown` / `post_cta_clicked` | ✅ | ✅ | |

**운영 판단은 EventLog 기준이다.** 어드민 집계가 전부 EventLog를 본다. GTM에만 있는 이벤트는 운영에서 보이지 않는다.

**`anon_cid`는 `trackEvent`가 중앙에서 자동으로 붙인다**(F19). 개별 호출부에서 직접 만들지 않는다.

**rate-limit 면제**: 전환 이벤트는 `src/app/api/events/route.ts`의 `CONVERSION_EVENTS`에 등록돼야 한다. **빠지면 429로 조용히 유실돼 분모만 깎인다.** 새 전환 이벤트를 추가할 때 반드시 확인한다.

> ⚠️ **`trackEvent`를 우회해 `anon_cid`가 안 붙는 이벤트가 4종 있다**: `identity_banner_view`·`exp1_exposure`·`magazine_view`·`web_vital`. `page_view` 기반 지표(UV·리텐션·실험 분모)에는 영향이 없지만, `exp1_exposure`는 실험 노출 이벤트라 정리 대상이다(§7-D).

---

## 6. 알려진 불일치 — 정책이 두 판정기에 걸쳐 있다

| # | 불일치 | 현재 결과 | 위험 |
|---|---|---|---|
| 1 | **Instagram 인앱**: `detectEnv`는 `instagram-inapp`으로 잡는데 배너의 `INAPP_ENVS`에는 없다 | 배너는 "일반 브라우저"로 취급(OAuth 직행), 실험은 "인앱"으로 취급(제외) | 사용자 피해는 없으나(둘 다 OAuth 직행) **정책이 두 곳에 갈라져 있다** |
| 2 | **Daum 인앱**: `detectEnv`가 인식하지 못해 `android-chrome`으로 떨어진다 | 실험 판정기는 `daum`을 인식해 제외 → 결과적으로 실험 미포함 | `detectEnv`만 보고 판단하면 **외부 브라우저로 오인**한다 |
| 3 | **`naver-inapp`이 OS를 구분하지 않는다** | 배너가 별도 `isIOS`로 다시 갈라 처리 | 판정기를 안 거치는 새 코드가 생기면 iOS 네이버가 Android 경로로 샌다 |
| 4 | **배너와 PostCTA의 인앱 정책이 다르다** | 배너=외부 브라우저, PostCTA=인앱 내 OAuth | 같은 화면에 서로 다른 두 CTA가 공존 |
| 5 | **`isStandalone`이 배너 게이트에 없다** | 홈 화면 PWA 사용자에게 배너가 뜬다 | 의도 미확인 |
| 6 | **`utm_source` 표기 불일치 — 3채널 전부** | 보내는 값 `kakao_inapp`·`naver_inapp`·`instagram_inapp` ↔ 받는 목록 `kakao-android`·`kakao-ios`·`naver-inapp`·`google-inapp` | PWA 플래그를 켜는 순간 도착 감지·자동 가입이 전부 불발 |
| 7 | **`intent://`에 폴백이 없다** | Chrome 미설치 기기에서 조용히 실패 | 실패율 미측정 |

---

## 7. 그룹 분류 — 무엇을 건드려도 되는가

### A. 정책 고정 그룹 — 바꾸려면 별도 승인

- **iOS 전 채널(Safari·Chrome·Naver/Kakao/Google 인앱)은 가입만 시킨다.**
- iOS에서 **PWA·앱 설치·외부 브라우저 유도 금지.**
- iOS 가입 CTA는 **카카오 OAuth 직행**이어야 한다. 중간 단계(주소 복사·안내 화면)를 넣지 않는다.
- TWA·Capacitor에는 **띠배너를 띄우지 않는다.**

### B. 실험 중 그룹 — **분모를 건드리면 안 된다**

- Android Chrome · Whale · Samsung Internet · 기타 Android 외부 브라우저
- 실험: `android_conversion_a2_b2` (가입-first `signup_warm` vs 앱-first `app_card`, 50:50)
- **금지**: 이 채널들의 배너 UI 구조·노출 조건·트리거·문구·오버레이 동작 변경
- 실험 결론 전까지 **단독 변경 대상에서 제외**한다

### C. 인앱 단일 변경 후보 — **지금 손댈 수 있는 곳**

- Naver / Kakao / Google 인앱 (iOS·Android 양쪽)
- 실험 세그먼트와 **배타적**이라 실험 분모에 닿지 않는다
- **다음 후보: 배너 노출 타이밍 조정**(§8)

### D. 리팩토링 후보 — 지금은 하지 않는다

| 후보 | 왜 필요한가 | 왜 지금은 안 되는가 |
|---|---|---|
| `detectEnv`·`getBrowserEnv`·`browser-env` 통합 | 같은 브라우저를 세 곳에서 다르게 판정 | 배너·PostCTA·PWA·실험 4곳이 물려 있어 **실험 분모가 동시에 흔들린다** |
| 인앱 목록 중복 제거 (`INAPP_ENVS`·`BLOCKED_ENVS`·`INSTALL_BLOCKED_ENVS`·`INAPP_UTM_SOURCES`) | 4곳에 각각 정의돼 있고 내용이 조금씩 다르다 | 통합 시 §6 불일치가 한꺼번에 동작 변경으로 이어진다 |
| CTA 문구 하드코딩 정리 | 문구 3종이 컴포넌트에 직접 박혀 있어 실험으로 못 바꾼다 | 실험 종료 후 |
| 배너 ↔ PostCTA 인앱 정책 정렬 | 같은 화면에서 다르게 동작 | **어느 쪽이 옳은지 데이터가 없다** |
| `intent://` 폴백 통일 | Chrome 미설치 시 조용히 실패 | 실패율 계측이 먼저 |
| 우회 이벤트 4종 `trackEvent` 편입 | `anon_cid` 누락 | 독립 가능하나 우선순위 낮음 |
| 실험 종료 후 정리 기준 부재 | variant 코드가 언제 걷히는지 규칙이 없다 | 규칙부터 정해야 함 |

### E. 절대 금지 / 주의 그룹

- **auth/session/login/signup 내부 로직** — `src/lib/auth.ts`·`auth.config.ts`·`kakao-start.ts`·`src/app/api/auth/**`
- **`src/middleware.ts`** — 세션 쿠키·CDN 캐시 정책 (HTML 응답 Set-Cookie 복구 금지)
- **F19 `anon_cid` 구현** — `src/lib/anon-cid.ts`·`src/lib/track.ts`
- **`android_conversion_a2_b2` 실험 정의** — `src/lib/experiments/**`
- **`/admin/ab-tests` 저장** · **`ExperimentState` row 생성**
- **prisma / migration / env / workflow / sitemap / robots / canonical**

---

## 8. 다음 PR 준비 — 인앱 한정 배너 노출 타이밍 조정

> 이 문서의 가장 중요한 산출물이다. 다음 PR은 이 절을 그대로 따른다.

**목적.** 글을 충분히 읽은 뒤에 가입을 제안해서, 방해가 아니라 자연스러운 제안이 되게 한다.

**왜 필요한가.** 인앱 배너는 지금 **글을 42%밖에 안 읽은 시점**에 뜬다(노출 시점 정독률 중앙값, 데스크탑은 86%). 설계 의도는 "정독 85% 후"지만, 인앱 사용자는 그 전에 60초 백스톱이 먼저 걸린다. 그 결과 **띄운 지 2.7초 만에 닫히고**(중앙값), 3초 이내 닫힘이 63.6%다. 구조적 방해(스크롤 잠금·바깥 탭 닫기)는 2026-08-09에 제거했는데도 이 수치가 남아 있다 — **남은 원인은 구조가 아니라 타이밍**이라는 뜻이다.

**적용 대상** (코드 근거: `INAPP_ENVS`)

| 채널 | `detectEnv` 값 |
|---|---|
| Naver 인앱 (iOS·Android) | `naver-inapp` |
| Kakao 인앱 (Android) | `kakao-android` |
| Kakao 인앱 (iOS) | `kakao-ios` |
| Google 인앱 (iOS·Android) | `google-inapp` |

**제외 대상**
- Android Chrome · Whale · Samsung Internet · 기타 Android 외부 브라우저 → **A/B 실험 중**
- iOS Safari · iOS Chrome → 일반 브라우저
- Desktop
- TWA · Capacitor → 배너 자체가 안 뜸

**예상 변경** (최종안은 PR에서 확정)
- 인앱 한정 60초 백스톱 **제거 또는 대폭 지연**
- 인앱 한정 **정독 85% 도달 후에만** 노출

**건드리면 안 되는 것**
- 문구 · 디자인 · CTA 클릭 경로
- auth · F19 `anon_cid` · `android_conversion_a2_b2` · PostCTA · PopupRenderer
- 노출 횟수 정책(`MAX_SHOWS = 4`) · 경로 목록(`CONTENT_PATHS`)

**기대값**
- 3초 이내 닫힘률 하락
- 전체 닫힘률 하락
- 계속 읽기 유지
- **CTR을 측정 가능한 수준으로 만든다** (지금은 클릭이 0~3건/일이라 측정 자체가 안 된다)

**PASS 기준**
1. 3초 이내 닫힘 **63.6% 대비 하락**
2. 노출 후 계속 읽기 **96%대 유지** (이탈 증가 없음)
3. 금지 문구 재등장 **0건**
4. `android_conversion_a2_b2` · F19 회귀 **0**

> ⚠️ **노출 총량 감소를 실패로 읽으면 안 된다.** 늦게 띄우면 노출은 당연히 줄어든다. 판정 축은 **노출당 CTR**과 **3초 내 닫힘률**이다.

---

## 9. 금지 문구 / 금지 UX

아래는 **다시 등장하면 회귀**다. QA에서 문자열로 검사한다.

### 금지 문구

| 문구 | 왜 금지인가 |
|---|---|
| `브라우저에서 가입하기` | 사용자가 "브라우저"라는 기술 개념을 이해해야 한다. 가입 버튼인데 가입이 시작되지 않는다 |
| `카카오 밖에서 가입하기` | 위와 동일 |
| `주소가 복사됐어요` | 가입을 눌렀는데 주소가 복사된다. 다음에 뭘 해야 하는지 알 수 없다 |
| `주소 다시 복사하기` | 실측상 **한 사용자가 7번 반복 클릭**했다. 진행되지 않는다는 신호 |
| `Safari 주소창에 붙여넣으면 가입할 수 있어요` | 수동 3단계를 요구한다. 이탈 지점 |

### 금지 UX

- **iOS에서 PWA·앱 설치·외부 브라우저 유도** — iOS에 앱이 없고 PWA 안내는 헛버튼이 된다
- **가입 버튼인데 가입이 바로 시작되지 않는 UX** — 클릭과 결과가 어긋나면 신뢰를 잃는다
- **사용자가 내부 기술 경로를 이해해야 하는 CTA** — "인앱", "외부 브라우저", "intent" 같은 개념 노출 금지
- **읽기를 막는 배너** — 배너가 뜬 동안 스크롤이 잠기거나, 본문 탭이 곧 닫기가 되는 구조 (2026-08-09 인앱 한정 제거)
- **아무 일도 일어나지 않는 CTA(no-op)** — 눌렀는데 반응이 없으면 버튼을 없애거나 다음 행동을 안내한다

### 추가 금지 제안 (근거 포함)

| 제안 | 근거 |
|---|---|
| **같은 화면에 가입 CTA를 두 개 이상 두지 않는다** | 노출 세션의 65.2%에서 배너와 PostCTA가 동시에 뜨고, 문구·동작이 다르다. 무엇을 누르는지 알 수 없다 |
| **폴백 없는 `intent://` 금지** | Chrome 미설치 기기에서 조용히 실패한다. `S.browser_fallback_url`을 반드시 넣는다(`app-links.ts` 패턴) |
| **판정기를 새로 만들지 않는다** | 이미 세 개다. 새 분류가 필요하면 기존 것을 확장하고 이 문서를 갱신한다 |

---

## 10. 다음 PR 후보 결정표

| 후보 | 목적 | 적용 대상 | 수정 가능 파일 | 건드리면 안 되는 것 | 기대값 | PASS 기준 | 위험 |
|---|---|---|---|---|---|---|---|
| **1. 인앱 한정 배너 노출 타이밍 조정** ⭐ | 방해가 아닌 제안으로 전환 | Naver/Kakao/Google 인앱 | `SignupPromptBanner.tsx` · 테스트 | 문구·디자인·클릭 경로·auth·F19·실험·PostCTA | 3초 닫힘↓, CTR 측정 가능 | 3초 닫힘 63.6%↓ · 계속 읽기 96%대 · 금지 문구 0 · A/B·F19 회귀 0 | 중 — 노출 감소를 실패로 오독할 위험 |
| 2. Android 인앱 가입 경로 실험 | 인앱 OAuth 직행 vs 외부 브라우저 경유 판정 | Android Naver/Kakao/Google 인앱 | 실험 registry·배너 | 기존 A/B 분모·iOS 정책 | 어느 축이 나은지 확정 | variant당 유의 표본 확보 | **높음 — 현재 인앱 클릭 0~3건/일로 표본이 모이지 않는다. 후보 1 이후로 미룬다** |
| 3. PostCTA ↔ 배너 정책 정렬 | 같은 화면 두 CTA 불일치 해소 | 인앱 전체 | `PostCTA.tsx` · `SignupPromptBanner.tsx` | auth·실험 | 선택 부담 제거 | 동시 노출 0 또는 동작 일치 · 가입 퍼널 회귀 0 | **높음 — 어느 쪽이 옳은지 데이터 없음. 후보 2 결과 필요** |
| 4. `detectEnv`/`browser-env` 통합 | 판정기 3개 → 1개 | 전 채널 | 판정 유틸·호출부 4곳 | 실험 분모 | 유지보수성 | 전 채널 판정값 동일성 증명 | **높음 — 실험 종료 후에만** |
| 5. 우회 이벤트 4종 `trackEvent` 편입 | `anon_cid` 누락 해소 | 전 채널 | 해당 컴포넌트·`track.ts` | F19 로직 | 계측 일관성 | 적재율 상승 · 기존 이벤트 회귀 0 | 낮음 — 독립 가능 |
| 6. Android 외부 A/B 조기/최종 판정 | 실험 결론 | Android 외부 브라우저 | 문서·어드민 조회 | 실험 정의(판정 전 변경 금지) | 승자 확정 | D7 재방문+참여 기준 | 중 — **설치 수로 판정하면 안 된다** |
| 7. F19 D7 재판정 | 비회원 재방문 정확도 확인 | 전 채널 | 문서 | F19 코드 | 재방문 상승 확인 | D7 상승 방향 | 낮음 — read-only |

---

## 11. 이 문서를 갱신해야 하는 때

- 채널 판정 로직(`detectEnv`·`getBrowserEnv`·`browser-env`)을 바꿀 때
- 배너·PostCTA·AddToHomeScreen의 **문구나 클릭 경로**를 바꿀 때
- 새 실험을 시작하거나 끝낼 때 (§7-B 갱신)
- 새 채널이 등장할 때 (§3 표에 행 추가)
- 금지 문구·UX가 추가될 때 (§9)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-08-11 | 최초 작성 — 16개 채널 정책 표, 판정기 3종 관계, 그룹 A~E 분리, 금지 문구·UX, 다음 PR 결정표 고정 | 채널별 전환 정책이 코드에만 있어 "알고 보니 이 브라우저는 다르게 동작했다"가 반복됨(2주간 hotfix 3회). 구현 전에 통제 기준을 문서로 고정 |
