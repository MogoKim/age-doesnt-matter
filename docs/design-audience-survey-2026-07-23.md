# 회원/비회원 1주일 리서치 의견함 — 설계 스펙 (2026-07-23)

> read-only 딥다이브 + 창업자 3결정 반영. 구현은 이 스펙 승인 후 착수.

## 목적
같은 1주일 기간에 **비회원용 설문**과 **회원용 설문**을 동시 운영하되, 로그인 여부로 **자동 분리 노출**한다.
- 비회원: "왜 가입하지 않는지"(가입 장벽)
- 회원: "왜 계속 오지 않는지 / 만족하는지"(재방문·활동 장벽)
- 1주일 후 개선 우선순위 도출. 응답은 운영자만, 1인 1회, 팝업/HERO는 입구만.

## 핵심 문제 (AS-IS)
1. **audience 부재**: Event에 대상 필드 없음. `getExposedEvent`(exposure.ts:25)는 채널당 PRIMARY 1개만 반환 → 회원/비회원 다른 설문 노출 불가. `findChannelConflict`가 같은 채널·기간 PRIMARY 2개를 차단.
2. **HERO 캐시 격벽**: HERO는 홈 `revalidate=300` ISR 서버 컴포넌트(HeroSlider.tsx:138, `auth()` 없음) → 캐시 HTML이 모두에게 동일. 회원용이 비회원에게 새어나감. (팝업/상세는 force-dynamic이라 세션 분리 안전)

## 확정 설계 (3결정 반영)

### 1) schema 변경 (승인됨) — Prisma migrate diff → Supabase HANDOFF
```prisma
enum EventAudience { ALL GUEST MEMBER }        // 신규
model Event {
  ...
  audience EventAudience @default(ALL)          // 1컬럼 추가, default ALL → 기존 회귀 0
}
```
- SurveyForm/SurveyResponse **무변경**(dedup·회원판정은 이미 userId/guestId 기반).
- 질문 타입 `scale_0_11`(NPS 0~10)은 `questions` Json이라 **schema 무관**, survey.ts 코드 타입만 추가.

### 2) 노출 resolver
- `getExposedEvent(channel, viewer)` — `viewer: 'guest' | 'member'`. `where`에 `audience: { in: viewer==='member' ? ['ALL','MEMBER'] : ['ALL','GUEST'] }` 추가. 채널·viewer당 1개.
- `getExposedSurvey(channel, viewer)` 동일 전달.

### 3) 채널별 audience 분리
| 채널 | 방식 | 비고 |
|---|---|---|
| **팝업** | SurveyPopup → `/api/events/exposed?channel=bottomPopup`. exposed route에 **`auth()` 추가** → viewer 판정 → getExposedSurvey(channel, viewer) | 세션 분리 완전 |
| **HERO** | **survey HERO를 client island로**. HeroSliderClient(client)가 마운트 시 `exposed?channel=hero`(세션 포함) fetch → survey 있으면 슬라이드 삽입. 서버 `buildSurveyTeaserSlide`는 제거(ISR 누수 차단). VOTE/FEEDBACK HERO는 서버 유지(ALL) | 홈 ISR 유지, 누수 0 |
| **/events 상세** | force-dynamic + `auth()` → 이벤트 `audience`와 viewer 불일치 시 `notFound()` | 직접 URL 접근 차단 |

### 4) 충돌 정책 (findChannelConflict에 audience 교집합)
| 기존 ↔ 신규 | 교집합 | 정책 |
|---|---|---|
| GUEST ↔ MEMBER | ∅ | **동시 허용** |
| ALL ↔ GUEST / ALL ↔ MEMBER / ALL ↔ ALL | 있음 | 충돌 차단 |
→ 같은 채널·시간겹침·PRIMARY이면서 **audience 교집합이 비어있지 않을 때만** 충돌.

### 5) dedup — 변경 없음
기존 `@@unique(surveyFormId,userId)`·`(surveyFormId,guestId)` + submit/status의 userId·guestId 판정 그대로. 회원설문=userId 1회, 비회원설문=guestId 1회.

### 6) 어드민 UX
- SurveyEventForm에 **"노출 대상" 라디오**(전체 / 비회원만 / 회원만) 추가 → `Event.audience`.
- 목록에 audience 배지. audience≠ALL 선택 시 "로그인 여부로 자동 분리 노출" 안내.

### 7) 결과 분석
- 기존 SurveyResults(total·memberCount·guestCount·문항요약) 재사용. 회원설문은 회원만, 비회원설문은 비회원만 응답.
- 비교 뷰는 후속(YAGNI, MVP 제외).

### 8) 질문 타입 scale_0_11 (NPS)
- survey.ts SurveyQuestionType += `scale_0_11`. validateAnswers(0~10 정수), summarizeQuestion(평균+NPS 분포), SurveyDetail 렌더(0~10 11버튼).

## 설문 내용 (창업자 초안 확정)
- **비회원용** "우나어, 가입하고 싶어지려면 뭐가 필요할까요?" — 유입경로/기대/미가입이유(multi)/가입의향(rating)/기대차이(long opt)/필요조건(long req) + consent
- **회원용** "우나어를 계속 쓰고 싶게 만들려면 뭐가 필요할까요?" — 만족도(rating)/추천가능성(**scale_0_11**)/부족한점(multi)/기대차이(long opt)/재방문조건(multi)/1순위개선(long req) + consent
- 두 설문 모두 audience 지정, 같은 1주일 기간, tier=PRIMARY, 팝업+HERO.

## 구현 파일 예상
| 파일 | 변경 |
|---|---|
| prisma/schema.prisma | EventAudience enum + Event.audience |
| src/lib/events/survey.ts | scale_0_11 타입 + 검증/집계/렌더 |
| src/lib/events/exposure.ts | getExposedEvent/Survey viewer 파라미터 + audience 필터 |
| src/app/api/events/exposed/route.ts | auth() viewer 판정 |
| src/components/features/home/HeroSlider.tsx / HeroSliderClient.tsx | survey HERO client island 전환(서버 build 제거, client fetch) |
| src/components/features/event/SurveyDetail.tsx | scale_0_11 렌더 |
| src/app/(main)/events/[id]/page.tsx | audience↔viewer notFound |
| src/app/admin/(panel)/vote-events/actions.ts | audience 저장 + findChannelConflict 교집합 |
| src/components/admin/SurveyEventForm.tsx | 노출 대상 라디오 |
| src/app/admin/(panel)/vote-events/page.tsx | audience 배지 |
| src/components/admin/SurveyResults.tsx | scale_0_11 요약(선택) |

## QA 체크리스트 (participation-events-qa.md 계층 A/B + audience)
- 비회원 세션: 비회원설문만(팝업/HERO/상세), 회원설문 URL notFound
- 회원 세션: 회원설문만, 비회원설문 차단
- **HERO 누수 0**: 비회원/회원 각각 HERO에서 상대 설문 안 보임
- 같은 기간 GUEST+MEMBER 동시 PRIMARY 저장 성공 / ALL↔GUEST·MEMBER 충돌 차단
- dedup 1인1회, 응답 비공개
- scale_0_11 0~10 입력·집계
- VOTE/FEEDBACK 팝업·HERO·/api/votes/today 회귀 0
- QA fixture는 HIDDEN(실노출 0)
- tsc/lint/build

## 창업자 HANDOFF (구현 중)
- schema: `prisma migrate diff` 생성 SQL만 → **창업자 Supabase SQL Editor 적용**. raw SQL·Node pg 미사용.

## 하면 안 되는 것
- NOTICE 미구현 · VOTE/FEEDBACK 회귀 · QA fixture PRIMARY 실노출 · raw SQL · 응답 사용자 공개.
