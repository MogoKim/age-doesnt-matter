# 데이터 추적 & EventLog 추출성 정밀 감사 — 베이스라인 (2026-06-08)

> READ ONLY 진단. 코드·DB 무변경. 실측 = 최근 30일 EventLog(총 26,059건).
> 재실행: `/data-audit` (`.claude/commands/data-audit.md`)

---

## ⚠️ 3차 재검증 교정 (2026-06-08, 실측 확정) — 아래 본문보다 이 섹션이 우선

베이스라인을 3회 적대적 재검증(코드+git+계산+실측)한 결과, **오판 2건 철회 + 무해 2건 확정 + 신규 중대 1건**:

### 🔴 신규 중대 — "Kakao 최고 채널"은 허구 (채널표 R0)
- 실측: `referrer`에 'kakao' 포함된 page_view **567건이 전부 `kauth.kakao.com`(487)+`accounts.kakao.com`(80)** = **100% 카카오 로그인 리다이렉트(내부)**. 진짜 카톡 공유 유입 0건.
- `admin.insights.ts:31` `classifyChannel`이 `ref.includes('kakao')`로 **로그인 리다이렉트를 'Kakao 유입'으로 오분류** → 인사이트 채널표의 "Kakao 전환 30%·재방문 25%"는 **신뢰 불가(허구)**.
- 권장(제안만): classifyChannel에서 `kauth./accounts.kakao.com` 제외 또는 OAuth 리다이렉트 referrer 필터.

### ✅ 철회 — R1(browser_env "100% 누락")은 오판
- 실측: 최신 page_view(6/2+) browser_env 부착 **98.8%**, signup_banner content_variant **100%**. browser_env는 `6a96689`(6/2) 추가라 과거 30일 결손 + 베이스라인 샘플이 정렬 없이 과거 위주로 뽑힌 **샘플링 편향**. → "깨짐" 아님, **정상 수집 중**. (단 "최근추가→과거결손"은 6/7 post_read·trigger_variant, 6/8 twa_gate_* 에도 동일 적용되는 체계적 함정 — 분석 시 기간 주의)

### ✅ 무해 확정 (베이스라인 우려 철회)
- **seed봇 DAU 누수 없음**: seed봇은 HTTP 요청 없이 Prisma 직접 INSERT → page_view 미생성 → DAU 무영향.
- **날짜 경계 정상**: `getKstMonthStart/TodayStart` -9h는 KST 자정의 UTC 표현(계산 검증). 버그 아님.
- **debug_stage(R2)**: 이미 삭제 완료(3,033건). 출혈 멈춤.

### 목적지 재분류
- `twa_gate_*` = EventLog만(GA4 아님), `signup_banner_shown` = 둘다. (베이스라인 "GA4만 18개" 중 3개 오분류 교정)

### 추가 주의 (저~중)
- D1 정의(`admin.retention.ts:37` `d>=firstDay+1`): 같은날 가입+활동 D1 미포함 → D1 과소 가능.
- rate limit 면제 불완전(post_cta_shown·signup_banner_shown·twa_gate_* 고활동 시 유실).
- EventLog 보존정책 0(무한증가).

### 재산정 등급
- 데이터 청결도: D → **C** (browser_env 정상 + debug 삭제), 단 **채널 정확도는 D**(Kakao 오분류).
- **종합 C-** 유지(browser_env 호재 ↔ Kakao 채널 오분류 악재 상쇄). 최우선 수정: **Kakao 채널 분류**.

---

## 0. 종합 등급
> (아래는 1차 베이스라인 원본 — 위 교정 섹션이 최신·우선)

| 차원 | 등급 | 한 줄 |
|------|------|------|
| 수집 커버리지 | **C** | 핵심 퍼널은 EventLog에 들어오나 18개 이벤트가 GA4-only |
| 데이터 청결도 | **D** | debug_stage 2,137건이 실유저(isBot=false)로 오염 + page_view browser_env 100% 누락 |
| 스키마 추출성 | **C-** | 핵심값 전부 properties Json 매장(인덱스 불가), 이벤트명 레지스트리 없음 |
| 웹/앱 패리티 | **D** | 디바이스 구분(browser_env)이 page_view에 안 실림 → page_view로 웹/앱 분리 불가 |
| **종합** | **C-** | "감"보다 낫지만, 디바이스·일부 퍼널 분석은 현재 신뢰 불가 |

---

## 1. 이벤트 인벤토리 (코드 39종 vs 실측 26종/30일)

실측 상위: page_view 17,573 · **debug_stage 3,009** · post_view 1,730 · **web_vital 641** · login 582 · home_card_click 463 · post_read 369 · **smoke_test 323** · search 298 · magazine_view 239 · post_cta_shown 237 · kakao_button_click 174 · job_view 118 · signup_step 111 · signup_banner_shown 43 · sign_up 39 · …

- **코드 인벤토리에 없는 적재 이벤트**: `debug_stage`(3,009) · `web_vital`(641, 의도적-WebVitalsReporter) · `smoke_test`(323) · `debug_error`(24)
- **코드엔 있으나 30일 미적재 18개**: signup_banner_{eligible,dismissed,clicked} · inapp_redirect_* · post_write_abandoned · board_view · landing_card_action · ad_click · cps_click · pwa_* · referral_share · play_store_click · twa_gate_*(최근 배포) → **대부분 GA4-only라 EventLog에 원래 안 옴**

---

## 2. 추출 깨짐 리스크 TOP 5 (근거 + 수치)

### 🔴 R1. page_view browser_env 100% 누락 — 디바이스 분석 불가
- 코드 `PageViewTracker.tsx:45`는 `trackEvent('page_view', { browser_env })` 전송. **실측: 실유저 page_view 500 샘플 중 browser_env 0건.** login도 `method`만 남고 browser_env 없음.
- 추정 원인: `getBrowserEnv()` 반환이 properties에 안 실림(undefined → JSON 키 제거 추정). **원인 정밀조사 필요**(이번 미수정).
- 영향: page_view 기반 웹/앱(TWA) 세그먼트 분석 불가. 디바이스 구분은 login/sign_up 일부 + signupSource에만 의존.

### 🔴 R2. debug_stage 2,137건이 isBot=false로 분석에 샘
- `debug_stage` 총 3,009건 중 **2,137건 isBot=false**(실유저로 분류). `debug_error` 22/24도 샘.
- 서비스 코드(src/)에 `debug_stage` 없음 → 외부/e2e가 **x-bot-type 헤더 없이** 발사 → 봇 필터 못 걸림.
- 영향: 전체 이벤트 카운트·이벤트 다양성 분석 노이즈. (eventName이 page_view가 아니라 퍼널 직접오염은 아니나 "이벤트 총량/오타 분석"을 흐림)

### 🟠 R3. 핵심 분석값 전부 properties Json 매장 — 인덱스 불가 + 조용한 오염
- EventLog 인덱스 5개 모두 컬럼(eventName/isBot/createdAt/userId) 기반. `browser_env`·`variant`·`channel`은 **properties Json 내부에만** → WHERE/인덱스 불가, 타입·키 오타 섞여도 에러 없이 '조용히' 분석 틀어짐.
- 실측 키 오염: **search 이벤트에 `query`와 `search_term` 중복 키** 공존(같은 의미 2개 키).

### 🟠 R4. 이벤트명 중앙 레지스트리 부재
- 39개 이벤트명이 문자열 하드코딩. 표준(단일 진실원천) 없음 → `debug_stage` 같은 임시 이벤트가 무단 적재되고, 오타가 새 이벤트로 적재돼도 못 막음.
- `CONVERSION_EVENTS`(api/events 3개)와 `registry.ts`의 `conversionEvent`가 **이중 관리**(전환 정의가 두 곳).

### 🟠 R5. EventLog 단독 퍼널 재구성 50~70%
- 가입 배너 클릭/이탈, pwa_*, ad_click, board_view 등 **GA4-only** → EventLog만으론 "배너 클릭→가입" 같은 구간 재구성 불가.
- 판정: 유입→가입→활동 3단계는 EventLog 자체로 가능, 광고 성과·일부 CTA는 GA4 필수.

---

## 3. 차원별 실측 표

**bot 분포(30일)**: isBot=false 15,613 / isBot=true 10,446 (40%). botType: e2e-test 4,597 · founder 3,020 · external-bot 1,630 · aws-crawl-bot 1,199.
- bot 이중기준: EventLog `isBot`(UA/IP/헤더) vs User(`@unao.bot`/`seed_`/providerId ^\d+$) — **직교**. 단 분석 쿼리는 EventLog `isBot:false` + User providerId 각각 적용 중이라 치명적이진 않음. 일원화 권장.

**null 비율**: sessionId null 32.2%(≈봇) · userId null 82.3%(비회원, 정상).

**variant 정합성**: signup_banner_shown — content A11/B14/C18, trigger early24/read_complete19 → **registry 정의(A/B/C, early/read_complete)와 일치 ✅**(variant 오염 없음). sign_up엔 variant 미저장(전환은 sessionId join 의존).

**PII**: `ip`·`userAgent` raw 저장, 마스킹·TTL 없음(GuestLike만 ipHash). 보존정책 미정의.

---

## 4. 표준화 권장 (제안만 — 이번 미실행)

1. **이벤트 택소노미 단일 진실원천**: `src/lib/analytics/events.ts`에 이벤트명 + 목적지 + property 화이트리스트 const 정의, trackEvent를 타입드 래퍼로. → 오타·미등록·debug 이벤트 차단.
2. **debug_stage/smoke_test 차단**: api/events에서 debug_* / smoke_test는 isBot=true 강제 또는 적재 거부(테스트 비콘은 별도 엔드포인트/플래그).
3. **browser_env 누락 수정**: page_view/login properties에 browser_env 실제 적재 (R1 원인 수정) — 디바이스 분석 복구.
4. **핵심값 승격**: 자주 쓰는 `browser_env`(또는 device)·`channel`을 EventLog 컬럼으로 승격 + 인덱스 → 추출 안정·고속화.
5. **bot 일원화**: 단일 `isRealHumanEvent` 기준 함수(EventLog isBot + User 규칙 통합).
6. **전환 정의 단일화**: CONVERSION_EVENTS ↔ registry conversionEvent 한 곳으로.
7. **PII 정책**: EventLog ip 해시화 또는 N일 TTL 정리 크론.

---

## 5. 결론

> 핵심 퍼널(유입→가입→활동)은 EventLog로 측정 가능하나, **① 디바이스 구분(browser_env) 사실상 깨짐 ② debug 이벤트 실데이터 오염 ③ 이벤트 표준 부재**가 데이터 신뢰도를 갉아먹는다. 큰 개선 전에 R1(browser_env)·R2(debug 차단)·R4(택소노미)부터 잡으면 추출성이 C-→B+로 오른다. (수정은 별도 승인 작업)
