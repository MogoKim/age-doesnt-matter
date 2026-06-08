# /data-audit — 데이터 추적 & EventLog 추출성 정밀 감사 (READ ONLY)

우나어(웹 + 안드로이드 TWA)의 "유입→탐색/참여→전환→이탈/재방문" 전 여정 데이터가
누락·중복·오염 없이 수집되는지, EventLog가 분석 추출이 깨지지 않게 설계됐는지 진단한다.

> ⚠️ **절대 원칙: 이건 진단이지 수정이 아니다.** 서비스 코드·DB·추적·워크플로우 무변경.
> DB는 read-only SELECT만(쓰기 0). 발견 문제는 **고치지 말고 제안만**. 임시 스크립트는 보고 후 삭제.
> 결론은 추측 금지 — 반드시 file:line 또는 실측 수치로.

가장 최근 베이스라인: `docs/analysis/data-audit-2026-06-08.md` (이전 결과와 비교해 추이 보고).

---

## 답해야 할 5가지 질문
1. 유입→이탈 퍼널에서 이벤트 안 찍히는 페이지/CTA(퍼널 구멍)는?
2. 웹과 앱(TWA)이 동등하게 추적되는가?
3. EventLog 자체만으로 유입→전환 퍼널 재구성이 되는가, GA4에 묶여 있나?
4. EventLog 스키마가 추출 깨짐 없게 설계됐나(이벤트명 표준·properties·인덱스·bot·PII)?
5. 실제 적재 데이터에 오염(오타 이벤트명·정의 외 키·variant 불일치·null 과다·debug 누수)이 있나?

---

## 단계 (순서대로)

### 1. 이벤트 인벤토리 (코드)
`grep -rn "trackEvent(\|sendEvent(\|gtag(\|eventName:" src/` 전수 → 표:
이벤트명 | file:line | 목적지(EventLog `track.ts`→/api/events / GA4 `gtm.ts` / 둘다) | properties 키 | 트리거.
- 발생부 Read: `src/lib/track.ts`, `src/lib/gtm.ts`, `src/components/common/PageViewTracker.tsx`, `PostViewBeacon.tsx`, `src/components/common/WebVitalsReporter.tsx`, `src/app/api/events/route.ts`(detectBot·CONVERSION_EVENTS).

### 2. 퍼널 커버리지
유입(utm/referrer/TWA google-play) → page_view → 참여(post_read/like/scrap/comment/share/home_card_click/search) →
전환(kakao_button_click/signup_step/sign_up/post_create) → 이탈/리텐션.
핵심 페이지(`/`·목록·상세·`/login`·온보딩·`community/write`·`/my`·검색)×CTA별 [있음/없음/부분] → **구멍 적출**.

### 3. 웹 vs TWA 패리티
`twa_gate_*`·`pwa_*`·`play_store_click` 존재 + `browser_env` 값 일관성. TWA가 웹과 동등 추적되는지.

### 4. 이중추적 정합성
이벤트를 EventLog만 / GA4만 / 둘다로 분류 → **"EventLog 단독 퍼널 재구성 가능 범위" 판정**.
(GA4는 접근 불가 → 코드로 목적지만 판정. 실측은 EventLog만.)

### 5. 스키마 감사 (`prisma/schema.prisma` EventLog + 관련 모델)
① 이벤트명 레지스트리 부재 ② properties Json 스프롤(핵심값 JSON 매장) ③ 인덱스 커버리지(properties 내부값 인덱스 불가)
④ bot 이중기준: EventLog `isBot`(detectBot UA/IP/헤더) vs User(`@unao.bot`/`seed_`/providerId `^\d+$`) 일관성
⑤ sessionId/userId null ⑥ PII(`ip`/`userAgent` raw·TTL) ⑦ CONVERSION_EVENTS ↔ registry `conversionEvent` 이중관리.
- 실험: `src/lib/experiments/{registry,assign,stats}.ts` — variant key(`content_variant`/`trigger_variant`/`twa_gate_variant`)가 `EventLog.properties`에 저장됨.

### 6. 실측 (READ ONLY)
임시 `agents/scripts/_audit-*.ts` 작성(SELECT/groupBy/count만), **DIRECT 5432로 실행**(EMAXCONN 회피):
```
DATABASE_URL="$DIRECT_URL" npx tsx --env-file=.env.local agents/scripts/_audit-events.ts
```
(`.env` 로드: `set -a; source .env; set +a` 후 `DATABASE_URL="$DIRECT_URL"`)
측정:
- 최근 30일 distinct eventName + 건수 → **코드 인벤토리와 대조**(오타/미등록/debug 누수 적출)
- 이벤트별 properties 키 집합(샘플) → **정의 외 키·중복 키·타입 오염**
- sessionId/userId null 비율, isBot/botType 분포
- **oddball(debug_*/smoke_test) 의 isBot=false 건수**(실데이터 누수 확인)
- 주요 이벤트(page_view/login)의 `browser_env` 실제 적재율(코드는 보내는데 DB에 있나)
- variant 저장값 vs `registry.ts` 정의 key 일치
→ **실행 후 임시 스크립트 삭제** (gitignore `_*.ts`이나 명시 삭제).

---

## 보고 형식
① 종합 등급(수집/청결/추출성/패리티 각 A~F) ② 차원별 실측 표 ③ 퍼널 구멍 TOP N
④ 추출깨짐 리스크 TOP N(근거 file:line + 실측 수치) ⑤ 표준화 권장(택소노미 단일진실원천 / property 화이트리스트 /
핵심값 컬럼 승격+인덱스 / bot 일원화 / debug 차단 / PII 정책 — **제안만**) ⑥ 임시스크립트 삭제 확인.
→ `docs/analysis/data-audit-{YYYY-MM-DD}.md` 로 저장하고 직전 베이스라인과 추이 비교.

## 알려진 베이스라인 리스크 (2026-06-08, 재확인 대상)
- R1 page_view/login `browser_env` 100% 누락(코드는 전송, DB 0) → 디바이스 분석 불가
- R2 `debug_stage` isBot=false 2,137건 실데이터 오염(서비스 코드엔 없음, 외부 발사)
- R3 핵심값 properties Json 매장 + search `query`/`search_term` 중복 키
- R4 이벤트명 레지스트리 부재 + CONVERSION 이중관리
- R5 18개 GA4-only → EventLog 단독 퍼널 50~70%
