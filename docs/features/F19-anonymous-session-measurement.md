---
id: F19
name: 비회원 세션 계측 기준
status: ACTIVE
created: 2026-08-07
updated: 2026-08-07
kind: 운영 기준 문서 (measurement standard)
---

# F19 — 비회원 세션 계측 기준 (정본)

> **이 문서는 기술 문서가 아니라 운영 기준 문서다.**
> 비회원 방문자·재방문·A/B 분모를 세는 방법이 여기서 정해진다. 숫자 해석과 코드 변경 모두 이 문서를 먼저 따른다.
>
> **아직 구현되지 않았다.** 이 문서는 기준을 고정하기 위한 것이고, 코드 변경은 후속 PR에서 한다(§12).
> 코드 기준: `origin/main` `b7cb9aa3` / 실측 기준: 2026-08-07 10:35 KST

---

## 1. 목적

### 왜 비회원 세션 계측이 중요한가

우리 트래픽은 **거의 전부가 비회원**이다. 최근 7일 EventLog 80,546건 중 `userId`를 가진 건 1,037건(**1.3%**)뿐이다. 회원 지표만 보면 서비스의 98.7%가 보이지 않는다.

비회원을 "몇 명"으로 셀지 정하지 못하면 방문자 수도, 재방문율도, 실험 분모도 전부 흔들린다. 그리고 이 숫자들이 흔들리면 **무엇을 고칠지에 대한 판단이 흔들린다.**

### North Star와의 관계 — 정확히 짚는다

North Star는 **주간 재방문 참여 유저 수**(`docs/constitution/NORTH_STAR.md` §12)다.

**North Star 본체는 이 문제의 영향을 받지 않는다.** `scripts/measure-north-star.ts`는 `userId`만으로 집계한다(`:83` `userId: { not: null }`, `:87-91` `daysByUser` Map). `sessionId`를 전혀 쓰지 않는다.

영향을 받는 것은 **선행지표**다. NORTH_STAR.md §12 지표 위계에서 선행지표는 *D7 리텐션 · 첫 댓글 전환율 · UGC 비율*이고, 이 중 **비회원 D7 리텐션**이 `sessionId` 기반이라 직격이다.

> 정리: **North Star 숫자 자체는 안전하다. North Star를 끌어올릴 레버를 고르는 근거가 흔들린다.**
> 이전 조사 보고에서 "North Star 판단이 흔들린다"고 뭉뚱그린 부분을 여기서 정정한다.

### 이 문서가 기준이 되는 작업

- 새 `trackEvent` 추가 (§9 체크리스트 필수)
- 어드민 방문자·리텐션 숫자 해석 (§10)
- A/B 실험 설계 시 분모 정의 (§5)
- 세션 식별자 관련 코드 변경 (§6~§8)

---

## 2. 현재 문제

### 첫 방문 동시 이벤트 구조

비회원이 검색으로 글 상세에 처음 들어오면, 마운트 직후 **최소 5종이 거의 동시에** `/api/events`로 발사된다.

| 이벤트 | 발화 지점 |
|---|---|
| `page_view` | `PageViewTracker.tsx:59` |
| `post_read` | `PostViewBeacon.tsx:44` (`send()`가 마운트 즉시 1회) |
| `post_view` | `PostViewBeacon.tsx:49` (`/api/posts/[id]/view` beacon) |
| `related_recommend_view` | `NextPostsInline.tsx:67` |
| `post_cta_shown` | `PostCTA.tsx:73` |

### `_anon_sid` 발급 시점

| 사실 | 코드 |
|---|---|
| middleware가 `/api/*`에 **미적용** | `src/middleware.ts:239-241` — `matcher: ['/((?!_next/static\|_next/image\|favicon.ico\|icons\|**api**\|...).*)']` |
| HTML 응답에 **Set-Cookie 하지 않음** | `src/middleware.ts:234-236` — *"HTML 페이지 응답에는 Set-Cookie를 하지 않음 — Vercel CDN HTML 캐시 허용"* |
| `_anon_sid`는 **`/api/events` POST 응답으로만** 발급 | `src/app/api/events/route.ts:62-63`, `:99-105` |

```ts
// api/events/route.ts:62-63
const existingSid = request.cookies.get('_anon_sid')?.value ?? null
const sessionId = isBot ? null : (existingSid ?? crypto.randomUUID())
```

`addAnonSession()`(`middleware.ts:37-50`)은 **리다이렉트 응답 경로에만** 쓰인다. 일반 HTML 응답에는 붙지 않는다.

### 왜 쪼개지는가

첫 방문에서 5개 POST가 **쿠키 왕복 전에 동시 출발**한다. 각 요청에 `_anon_sid`가 없으니 서버는 **각각 새 UUID**를 만들고 각 응답이 서로 다른 쿠키를 내린다. 브라우저는 마지막 응답의 값만 남기고, 나머지는 **이벤트 1개짜리 고아 세션**이 된다.

### 실제 타임라인 (프로덕션 실측, 2026-08-07)

```
0시 2분 22초  sid=cf9b8816  post_read
0시 2분 22초  sid=396f1d8a  post_cta_shown
0시 2분 22초  sid=1f9d6544  page_view
0시 2분 22초  sid=eb1b333c  post_view
0시 2분 22초  sid=099c3972  related_recommend_view
0시 2분 26초  sid=099c3972  post_read              ← 이후 하나로 수렴
0시 2분 37초  sid=099c3972  post_read
```

동일 기기(`ip+userAgent`)에서 **같은 초에 5개의 서로 다른 sessionId**가 생겼다.

### 규모 (실측)

| 창 | 이벤트 | 고유 sessionId | 기기(ip+ua) | 기기당 전체 sid | 기기당 `page_view` sid |
|---|---|---|---|---|---|
| 오늘 (08-07) | 3,986 | 1,926 | 461 | **4.24** | **1.07** |
| 실험 시작 이후 (08-06 21:00~) | 6,426 | 3,273 | 733 | 4.51 | 1.07 |
| 최근 7일 | 80,546 | 42,645 | 7,806 | 5.50 | 1.08 |

기기 80.2%가 sessionId 2개 이상, 첫 10초 안에 평균 5.00개 생성.

---

## 3. 정정된 영향 범위

> ⚠️ **이전 조사 보고의 "방문자 4.2배 과대"는 틀렸다.** 4.24는 *전체 이벤트* 기준 기기당 sid이고, 어드민 UV는 `eventName='page_view'`로 필터하므로(§4) 실제 왜곡은 **1.07배**다.

### 영향받는 것

| 대상 | 근거 | 실측 피해 |
|---|---|---|
| **비회원 D1/D7 리텐션** | `admin.retention.ts:100` — 코호트 = `page_view`의 `sessionId` 첫 등장일 | 🔴 7일 재방문 기기 85개 중 **45개(52.9%) 유실**. 어드민 수치는 실제의 **약 47%** |
| **어드민 KR4 비회원 D7** | `admin.dashboard.ts:34-48` 동일 정의 | 🔴 동일 |
| **`admin.experiments-retention.ts`** | `:71~` 노출 `sessionId`를 분모로 D1~D7 | 🔴 동일 구조 |
| **첫 진입 직후 노출되는 A/B 분모** | `related_recommend_view`가 초기 버스트에 포함(`NextPostsInline.tsx:67`) → `admin.experiments-related-algo.ts:55` | 🔴 분모 파편화 |
| `post_read` 기반 정독 분석 | 초기 버스트 포함 | 🟡 기기당 sid **1.78~1.87** |
| North Star의 **선행지표** 판단 | 비회원 D7이 선행지표 | 🔴 간접 |

### 영향이 작거나 없는 것

| 대상 | 근거 | 실측 |
|---|---|---|
| **North Star 본체** | `measure-north-star.ts:83,87-91` — `userId`만 사용 | ✅ **무영향** |
| **어드민 UV (일/월)** | `page_view`는 pathname당 1회 → 기기당 sid 1.07 | 🟡 **+7%** (오늘 422 vs 기기 396) |
| **`android_conversion_a2_b2` 분모** | 정독 85%/60초 백스톱 후 발화 → 쿠키 수렴 완료 | ✅ 기기당 sid **1.00** |
| `signup_banner_shown/clicked/dismissed` | 동일 | ✅ 기기당 sid **1.00** |
| 회원 가입·활동·회원 리텐션 | `userId` 기준 | ✅ 무영향 |
| `sign_up` / `signup_step` | `userId` 기준 | ✅ 무영향 |
| 월 PV | 이벤트 수 기준 | ✅ 무영향 |

**규칙으로 일반화**: *첫 진입 10초 안에 발화하는 sessionId 기반 지표는 위험하다. 늦게 발화하거나 `userId` 기반이면 안전하다.*

---

## 4. 식별자 역할 정의

| 식별자 | 정본 여부 | 수명 | 역할 | 쓰면 안 되는 곳 |
|---|---|---|---|---|
| **`userId`** | ✅ **로그인 회원 정본** | 영구 | 회원 지표·North Star 본체 | — |
| **`anon_cid`** | 🔜 **비회원 기기 정본 후보** (미구현) | localStorage (ITP 7일 한계) | 비회원 UV·리텐션·실험 분모 | — |
| **`_anon_sid`** | 🟡 현행 세션 식별자 / 향후 **fallback** | 쿠키 30일 슬라이딩 (`middleware.ts:46`, `route.ts:103`) | `anon_cid` 부재 시 대체 | 첫 버스트 구간 단독 신뢰 |
| **`sessionId`** (EventLog 필드) | 🟡 이행기 유지 | — | 과거 시계열 연속성 | 신규 분석의 단독 기준 |
| **`ip` + `userAgent`** | ❌ **분석 근사값** | — | 오프라인 검증·보정 리포트 | 🚫 **프로덕션 식별자 금지** |
| **`page_view`** | ❌ 식별자 아님 | — | 방문 관찰 이벤트 | 🚫 "이게 유저 수"라고 단정 금지 |

`ip+ua`를 프로덕션에서 금지하는 이유: CGNAT·공용 와이파이는 **서로 다른 사람을 한 명으로 합치고**, 모바일 IP 변동은 **같은 사람을 여러 명으로 쪼갠다**. 개인정보 측면에서도 IP 기반 영구 식별은 정당화가 어렵다.

---

## 5. 지표 정의

### UV (순 방문자)
**정의**: 해당 기간에 `page_view`를 1회 이상 남긴 **고유 비회원 식별자 수** (봇 제외, 내부 세션 제외).
**현행 구현**: `page_view`의 distinct `sessionId` (`admin.dashboard.ts:227-235`).
**한계**: 첫 버스트 파편으로 **약 +7% 과대**. `anon_cid` 도입 후 정본은 `anon_cid`.

### 방문
**정의**: 한 식별자가 특정 **KST 날짜**에 `page_view`를 남긴 것. 세션 타임아웃(30분 등) 개념은 **쓰지 않는다** — 우리는 "일 단위 방문"으로만 센다.
**한계**: 쿠키/스토리지 수명(30일 / ITP 7일)을 넘으면 같은 사람이 새 방문자로 잡힌다. **장기 리텐션은 구조적으로 과소**다.

### 비회원 D1/D7 리텐션
**정의**: 코호트 = 식별자의 **첫 `page_view` KST 날짜**. D-N = 첫 방문일 + N일 **이후 재방문 존재**(누적 생존).
**분모**: **N일이 경과한(성숙) 코호트만.** 아직 N일이 안 지난 코호트는 실패로 세지 않고 분모에서 제외한다(`admin.retention.ts:34-37`).
**주의**: D-N마다 분모가 달라 D1 ≥ D3 ≥ D7 단조성이 보장되지 않는다(정의상 의도).

### A/B 실험 분모
**정의**: 노출 이벤트를 남긴 **고유 식별자 수**. 현행은 `sessionId` 집합(`admin.experiments-web.ts:110`).
**필수 규칙**: 실험을 설계할 때 **분모를 무엇으로 세는지 문서에 명시한다**(§8 금지 패턴).
**안전 조건**: 노출 이벤트가 **첫 진입 10초 이후**에 발화하면 파편화 영향이 없다. 즉시 노출형 실험은 `anon_cid` 도입 전까지 분모를 신뢰하지 않는다.

### "주간 재방문 참여 유저"에서 비회원의 위치
North Star는 **로그인 회원만** 센다(`measure-north-star.ts`). 비회원은 North Star에 **직접 들어가지 않는다**.
비회원 지표는 **선행지표**로서, "가입 전 단계에서 다시 오고 있는가"를 본다. 따라서 비회원 D7은 North Star의 *구성요소*가 아니라 *예측 변수*다. 이 구분을 흐리면 안 된다.

---

## 6. 해결안 비교

| 기준 | **A. 클라 `anon_cid` 동봉** | **B. middleware/HTML 쿠키 선발급** | **C. 서버 ip+ua 시간창 병합** | **D. 클라 큐잉 후 배치** |
|---|---|---|---|---|
| 파편화 방지 | ✅ 완전 (첫 이벤트 전 동기 확보) | ✅ 완전 | 🟡 부분 (윈도우 밖 실패) | 🟡 첫 이벤트 유실 위험 |
| **성능 영향** | ✅ **localStorage 1회 read/write. 네트워크 요청 증가 0, 초기 JS 수십 바이트** | 🔴 **TTFB↑** (CDN 캐시 미스) | 🟡 이벤트마다 **DB 조회 1회 추가** | 🔴 첫 이벤트 지연·타이머 추가 |
| Vercel CDN/HTML 캐시 | ✅ 영향 0 | 🔴 **Set-Cookie가 HTML 캐시를 무력화** | ✅ 0 | ✅ 0 |
| SEO | ✅ 0 | 🔴 TTFB 악화 → LCP 영향 가능 | ✅ 0 | ✅ 0 |
| 개인정보/쿠키 정책 | ✅ localStorage, 쿠키 증분 0 | 🟡 현행과 동일 | 🔴 **IP 기반 병합 = 타인 합류 위험** | ✅ 0 |
| 앱/TWA/인앱 | ✅ 동작 | ✅ 동작 | 🟡 인앱·공용망 오병합 | 🟡 인앱 beacon 제약 |
| 기존 EventLog 호환 | ✅ `properties.anon_cid` 병행 → 단절 0 | ✅ 완전 호환 | ✅ | ✅ |
| 과거 데이터 보정 | ❌ 신규만 | ❌ 신규만 | ✅ **유일하게 소급 가능** | ❌ |
| 구현 난이도 | 낮~중 | 낮 | 중~높 | 높 |
| 테스트 가능성 | ✅ 순수 함수 단위 + E2E | 🟡 캐시 동작 검증 어려움 | 🟡 | 🔴 |
| 롤백 | ✅ 읽는 쪽만 되돌림 | ✅ 쉬움 | 🟡 | 🔴 |
| **치명 결함** | Safari ITP가 localStorage를 7일 후 삭제 가능 → **iOS 장기 리텐션 과소** | **성능·비용 회귀** (CDN 캐시 파기) | **타인 세션 병합** | `sendBeacon`은 **응답을 못 읽어** 쿠키 수립을 알 수 없음 → 실현성 낮음 |

---

## 7. 추천안 — A + `_anon_sid` fallback 병행 (**아직 구현하지 않는다**)

1. 클라이언트가 `anon_cid`를 **동기 생성**해 모든 `trackEvent` payload에 동봉한다.
2. 서버는 **`anon_cid` 우선, 없으면 기존 `_anon_sid`** 로 식별자를 결정한다.
3. 이행기 동안 `sessionId` 필드는 **그대로 유지**한다.
4. 과거 데이터는 **오프라인 보정 리포트로만** 다룬다.

### 왜 HTML Set-Cookie 복구(B)를 피하는가
`middleware.ts:234-236`이 Set-Cookie를 뺀 것은 **Vercel CDN HTML 캐시를 살리기 위한 의도된 결정**이다. 되살리면 TTFB·LCP가 나빠지고 ISR Writes 비용이 되돌아온다. 계측을 고치자고 **첫 화면 속도와 비용을 내주는 교환은 하지 않는다.** 이건 별도 비용 판단이 필요한 사안이지 계측 PR에서 처리할 일이 아니다.

### 왜 첫 이벤트 전에 API를 하나 더 부르지 않는가
식별자 발급 API를 추가하면 **첫 화면에 네트워크 왕복이 1회 늘고**, 그 응답을 기다리는 동안 이벤트가 지연되거나 초기 렌더가 막힌다. `anon_cid`는 서버 없이 클라이언트에서 만들 수 있으므로 **왕복이 필요 없다.**

### 왜 ip+ua 병합(C)을 프로덕션 식별자로 쓰지 않는가
CGNAT·공용 와이파이에서 **서로 다른 사람이 한 식별자로 합쳐진다.** 계측 정확도 문제를 넘어 개인정보 관점에서도 정당화가 어렵다. 오프라인 검증에만 쓴다.

### 왜 `anon_cid`와 `sessionId`를 병행하는가
`sessionId`를 즉시 갈아치우면 **과거 시계열과 단절**된다. 병행하면 같은 기간을 두 기준으로 계산해 **"측정 기준이 바뀌어서 생긴 변화"와 "실제 변화"를 분리**할 수 있다.

### 왜 Prisma schema 변경 없이 시작할 수 있는가
`EventLog.properties`가 JSON이므로 `anon_cid`를 여기에 넣으면 **마이그레이션 없이** 시작할 수 있다. 정착 후 전용 컬럼+인덱스로 승격할지는 그때 판단한다.

### 한계 — Safari ITP
Safari ITP는 스크립트가 쓴 localStorage를 **7일 후 삭제**할 수 있다. iOS 장기 리텐션은 여전히 과소 측정된다. `_anon_sid`(쿠키 30일) fallback이 부분적으로 메우지만 **완전 해결은 아니다.** 이 한계는 지표에 주석으로 남긴다.

### 성능 상한 (하드 제약)
- 추가 네트워크 요청 **0**
- localStorage **read 1회 + (최초 1회) write 1회**
- 초기 JS 증가 **무시 가능 수준**, 외부 라이브러리 **0**
- 초기 렌더를 막는 `await`/비동기 초기화 **금지**

---

## 8. 금지 패턴

1. 🚫 첫 마운트에서 `trackEvent`를 추가하면서 **세션 식별자 준비 여부를 고려하지 않는 것**
2. 🚫 `page_view`만 보고 **비회원 유저 수를 단정**하는 것
3. 🚫 `ip+ua`를 **영구 식별자**로 쓰는 것
4. 🚫 **HTML 응답 Set-Cookie를 비용·캐시 검토 없이 되살리는 것**
5. 🚫 첫 이벤트 전에 **식별자 발급 API를 추가**하는 것
6. 🚫 실험 분모를 **어떤 식별자로 세는지 문서화하지 않는 것**
7. 🚫 계측을 위해 **초기 렌더/초기 JS를 무겁게** 만드는 것

---

## 9. `trackEvent` 추가 규칙 (체크리스트)

새 이벤트를 추가할 때 아래를 전부 확인한다.

- [ ] 이 이벤트는 **첫 진입 10초 안에** 나가는가? → 그렇다면 파편화 영향권. 분모로 쓰지 말 것
- [ ] **비회원 리텐션·실험 분모**에 쓰이는가? → 식별자 기준을 문서에 명시
- [ ] **rate-limit 면제** 대상인가? → `api/events/route.ts` `CONVERSION_EVENTS`에 등록. 누락 시 429로 **조용히 유실**된다
- [ ] `userId` / `anon_cid` / `sessionId` 중 **무엇으로 조인**할 것인가?
- [ ] 앱·TWA·인앱에서 **같은 의미**인가? (`browser_env` 확인)
- [ ] **EventLog와 GA4 파라미터가 일치**하는가? (현재 `signup_banner_*`는 불일치 — 반복 금지)
- [ ] 이 이벤트 때문에 **네트워크 요청 수나 초기 JS가 늘어나는가?**
- [ ] 이 이벤트가 **실패해도 UI 렌더를 막지 않는가?** (fire-and-forget 유지)

---

## 10. 어드민 숫자 해석 주의

- **UV**: 현재 오차 약 +7%. 경미하지만 "사용자 수 정본"은 아니다.
- **비회원 D1/D7**: **실제의 약 47% 수준으로 과소**일 가능성이 크다. 낮게 나온다고 "리텐션이 나쁘다"고 단정하지 말 것.
- **보정 전/후 병기**: 기준 변경 전후 비교 시 두 수치를 함께 제시한다.
- **`ip+ua` 보정값의 한계**: CGNAT는 과대, IP 변동은 과소. **방향은 신뢰하되 절대값은 참고치.**
- ⚠️ **구현 후 숫자가 변하면, 사용자가 갑자기 늘거나 줄어서가 아니라 측정 기준이 바뀌어서일 수 있다.** 예상 방향: UV 약 −7%, 비회원 재방문 약 2배 상승. 이 방향으로 움직이면 **정상**이다.

---

## 11. QA 체크리스트 (구현 PR에서 검증)

**정합성**
- [ ] 신규 컨텍스트로 첫 글 상세 진입 시 `page_view`·`post_view`·`post_read`·`post_cta_shown`·`related_recommend_view`가 **같은 `anon_cid`** 를 갖는가
- [ ] 기기당 식별자가 **1.00** 인가 (현재 4.24 → 목표 1.00)
- [ ] `_anon_sid` fallback이 유지되는가
- [ ] **localStorage 차단 환경**(시크릿 모드 등)에서 이벤트가 깨지지 않는가

**채널**
- [ ] Android Chrome / **Naver 인앱** / iOS Safari / Desktop / TWA / Capacitor에서 정상 적재되는가

**회귀**
- [ ] `android_conversion_a2_b2` 분모가 회귀하지 않는가 (기기당 sid 1.00 유지)
- [ ] 어드민 D1/D7이 **기대 방향**(상승)으로 움직이는가

**성능 (필수)**
- [ ] **Lighthouse / Web Vitals 회귀 없음** (LCP·INP·CLS·TTFB)
- [ ] **초기 네트워크 요청 수 증가 없음**
- [ ] **초기 JS 번들 증가가 의미 있게 없음**
- [ ] `PageViewTracker`·`SignupPromptBanner`·`PostViewBeacon`·`PostCTA` 초기 로딩이 무거워지지 않았는가

---

## 12. 후속 구현 PR 범위 (예상)

| 파일 | 변경 |
|---|---|
| `src/lib/anon-cid.ts` | 신규 — 순수 함수(생성·조회·fallback) |
| `src/lib/track.ts` | payload에 `anon_cid` 동봉 |
| `src/app/api/events/route.ts` | `anon_cid` 우선 → 식별자 결정 |
| `src/lib/queries/admin/admin.dashboard.ts` | UV·KR4 식별자 우선순위 |
| `src/lib/queries/admin/admin.retention.ts` | 비회원 코호트 식별자 |
| `src/lib/queries/admin/admin.experiments-web.ts` | 분모 식별자 |
| `src/lib/queries/admin/admin.experiments-retention.ts` | 동일 |
| `src/__tests__/anon-cid.test.ts` | 신규 단위 테스트 |
| `docs/features/F19` · `F16` · `REGISTRY.md` | 문서 갱신 |

**Prisma schema 변경 없음** (`properties` JSON으로 시작).

---

## 13. 남은 미지수

1. **`ip+ua` 근사 오차율** — CGNAT 과대 / IP 변동 과소. 정량화 안 됨
2. **Safari ITP 영향 규모** — iOS localStorage 7일 삭제가 D7에 미치는 영향 미측정
3. **과거 데이터 보정 신뢰도** — 오프라인 ip+ua 병합의 오차율 미검증
4. **`related_recommend_view` A/B 실제 피해 규모** — 파편화 확인했으나 실험 결론 왜곡 정도는 미측정
5. **어느 응답의 쿠키가 이기는지** — 브라우저·네트워크 순서 의존. 재현 규칙 미확인
6. ~~North Star 산출 스크립트가 sessionId를 쓰는가~~ → **해소**: `measure-north-star.ts`는 `userId`만 사용(§1)

---

## 14. 레거시 · 결정 이력

| 날짜 | 결정 | 이유 | 부작용 |
|---|---|---|---|
| (이전) | middleware가 **HTML 응답 Set-Cookie 제거** | Vercel CDN HTML 캐시 허용 (TTFB·ISR 비용) | **첫 버스트 파편화** — 이 문서의 문제 |
| (이전) | `_anon_sid`를 `/api/events` POST 응답에서 발급 | 위 결정의 대체 수단 | 첫 이벤트가 쿠키보다 빠름 |
| (이전) | 쿠키 **30일 슬라이딩** (`middleware.ts:46`) | "365일 = 1세션" 왜곡 방지 | 30일 초과 재방문은 신규로 집계 |
| 2026-08-07 | 본 문서 신설, 추천안 A 확정 (**구현 보류**) | 부분 패치 반복 방지 — 기준부터 고정 | — |

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-08-07 | 최초 작성 — 목적·정의·해결안·금지 패턴·QA 기준 고정. **구현 없음** | 비회원 세션 계측을 기준 문서 없이 여러 번 부분 패치해 반복 재발. 이번엔 기준부터 정본화 |
