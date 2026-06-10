# 우나어 — SNS A/B 테스트(SocialExperiment) 제거 검토 딥다이브 (교차검증판)

> **버전**: 2026-06-10 v5 (3개 세션 교차검증 + DB 절차 정정 + social-poster experimentId 5곳 완전 명시) · **조사**: Claude (Opus 4.8), 코드 한 줄 단위 정독
> **상태**: 🟡 조사·교차검증 완료 / **삭제 범위 결정 보류** (창업자 결정 대기) · 코드 미변경
> **분류**: 내부 검토 문서

---

## 0. 배경 · 목적 · 목표

### 📌 배경 (Why now)
어드민 "SNS 테스트"(`/admin/experiments`) 점검에서 출발. SNS A/B 테스트는 실험 설계(`social-strategy`)·분석(`social-reviewer`)이 **2026-05-15 cron 중단**된 정지 레거시(`agents-social.yml`에 `DISPATCH ONLY` 명시). 새 실험 생성·분석이 멈춰 어드민 화면엔 옛 실험만 남거나 비어 있음. 게시(`social-poster`)·수집(`social-metrics`)은 실험과 무관하게 매일 GHA로 정상 운영 중. 창업자가 SNS A/B를 운영하지 않아 **코드~DB~GHA 완전 제거**를 검토하나, `SocialExperiment` 참조가 9개 파일에 퍼져 **종속성 버그 위험**이 큼.

### 🎯 목적 (Purpose)
레거시를 **종속성 버그 없이 안전하게 제거**하기 위해 전체 종속성을 코드 한 줄 단위로 매핑. 특히 이름이 비슷한 **웹 A/B(`ExperimentState`, `/admin/ab-tests`) 오삭제를 차단**.

### ✅ 목표 (Goals)
1. `SocialExperiment`/`experimentId` 전수 식별 + 웹 A/B와 분리 확정.
2. SNS 게시·수집 유지하며 실험만 떼는 경로 확정(함수·줄 단위).
3. `social-strategy`/`social-reviewer` 삭제 범위 결정(부가기능 동반 제거 여부).
4. DB 변경을 **이 프로젝트 고유 방식(pg 직접 SQL)**으로, 맨 마지막·창업자 수동으로 두는 안전 순서 + 검증 명시.

---

## 1. 🔁 교차검증 결과 (3개 세션 독립 검증)

세 Claude 세션이 독립적으로 코드를 정독·검증. **결론 일치, 정확도 높음.** 핵심 확정:

### ✅ 코드로 확정 (안심 영역)
- **웹 A/B ↔ SNS A/B 스키마 레벨 완전 독립**: `ExperimentState`(schema 1267–1278)는 `status String`(enum 미사용)·`experimentId String @unique`(FK 아님, `registry.ts` 코드 키)·SocialExperiment **relation 0개**. 반면 `SocialExperiment`는 `enum ExperimentStatus` 사용 + `SocialPost.experimentId` FK. → 오삭제 구조적 연결고리 없음.
- **`enum ExperimentStatus`(231)는 SocialExperiment 전용** → 삭제 안전.
- **social-poster fallback 실재**: `decide*()` else 경로가 이미 `dayStrategy` 기반, `shouldAutoPost`는 `if(!experiment) return true`. 실험 제거 안전.
- **cron 중단 확정**: strategy/reviewer `DISPATCH ONLY 2026-05-15`. poster/metrics/token-refresh는 schedule 생존 → 유지.

### ⚠️ 실행 랜드마인 (단 하나)
**`experimentId` 필드명 충돌**: `SocialPost.experimentId`(FK·삭제 대상) vs `ExperimentState.experimentId`(@unique·절대 보존)가 **이름만 같고 의미가 다름**. 무지성 `grep experimentId` 일괄삭제 시 웹 A/B 깨짐 → 반드시 `socialExperiment`/`SocialPost.experimentId` 범위로 한정.

### 🔧 1차 분석에서 정정·보강된 4가지
1. **social-strategy는 옵션 B(실험만 제거) 사실상 불가** — `main()` 전체가 실험을 축으로 구성(`conductMeeting` agenda·`STRATEGY_MEMO`에 실험 임베드). "실험 없는 주간전략" 경로가 코드에 없음 → **A(통째 삭제) 또는 재작성**.
2. **social-reviewer는 다목적** — 차원별 성과 랭킹(69–108)은 전체 게시물 분석(실험 무관), 실험부만 `if(activeExperiment)` 가드. 통째 삭제 시 **"3일 주기 일반 SNS 성과 리포트"도 함께 제거**(cron 중단·cmo-dashboard 대체 가능).
3. **`conductMeeting` 고아화** — `conductMeeting`(meeting.ts:71)의 **유일한 호출처가 social-strategy.ts:136**(`WEEKLY_STRATEGY` 타입도). social-strategy 삭제 시 `meeting.ts`가 **dead code**화. (※ `loadTodayBrief`는 8곳 사용=진짜 공용, 유지) → meeting.ts를 **휴면 보존 vs 함께 정리** 결정 필요.
4. **social-poster `buildCMOContextBlock`도 수정 대상** — `buildCMOContextBlock`(171–228)이 `cmoContext.recentLearnings`를 `## 최근 학습 (지난 실험 결과)`로 **프롬프트에 렌더링**(216–217). 실험 learnings를 끊으려면 여기도 제거. (단 `activeExperiment`는 이 함수에서 렌더링 안 함 — CMOContext 인터페이스 필드만 제거.)

### 🔴 DB 변경 방식 — 이 프로젝트 고유 제약 (가장 중요, v3 정정)
**이 프로젝트는 `prisma migrate`·`prisma db push`를 금지한다** (prisma-guide.md:5, gotchas.md:3 — Supabase pooler 6543 비호환, 100% 실패). DB 변경은 **Node.js pg 모듈로 직접 SQL 실행** + `information_schema`로 검증한다(prisma-guide 스킬 / references/pooler-issues.md).
- 따라서 `prisma migrate status`·`migrate diff`·`migrate deploy` 절차는 **전부 이 프로젝트에서 작동하지 않음**(v3·다른 세션 권장 오류).
- `SocialExperiment`/`enum ExperimentStatus`가 마이그레이션 SQL 파일에 없는 것은 **"위험한 drift"가 아니라**, prisma migrate를 안 쓰는 이 프로젝트에선 **정상 상태**(pg로 직접 생성된 테이블). → `migrate dev`가 reset을 제안할 시나리오 자체가 없음(애초에 안 돌림).
- **실제 제거 = pg 모듈 직접 SQL**:
  ```sql
  ALTER TABLE "SocialPost" DROP CONSTRAINT IF EXISTS "SocialPost_experimentId_fkey";
  ALTER TABLE "SocialPost" DROP COLUMN IF EXISTS "experimentId";
  DROP TABLE IF EXISTS "SocialExperiment";
  DROP TYPE IF EXISTS "ExperimentStatus";
  ```
  (FK 먼저 → 컬럼 → 테이블 → enum 순서. 실행 후 `information_schema.columns`/`pg_type`로 검증.)

---

## 2. ⚖️ 결정 보류 포인트

| 옵션 | 내용 | 평가 |
|------|------|------|
| **A. 통째 삭제** | social-strategy·reviewer 완전 제거 → 실험 + 주간전략 + 일반 성과리뷰 + WEEKLY_STRATEGY 회의 모두 제거 | **권고.** 모두 cron 중단이라 운영 공백 0 |
| **B. 실험만 제거** | 참조만 떼고 기능 유지 | social-strategy는 B 불가(재작성 필요). 사실상 "reviewer만 strip + strategy 삭제"가 유일한 B형태 |

→ **A 채택 시 `meeting.ts` 처리(휴면/정리) 추가 결정 필요.**

---

## 3. 전수 영향 맵 (직접 정독 — 파일:줄)

### A. 완전 삭제
- `agents/cmo/social-strategy.ts` (create 197, STRATEGY_MEMO 213, conductMeeting 136)
- `agents/cmo/social-reviewer.ts` (update 178, SOCIAL_REVIEW 206, getExperimentValue 241)
- `src/app/admin/(panel)/experiments/` (폴더째)
- `agents/core/meeting.ts` — **A + 정리 선택 시** (단독 dead code; 휴면 보존도 가능)

### B. 부분 수정 (실험 참조 제거 — fallback 확인됨)
| 파일 | 제거 지점 |
|------|----------|
| `agents/cmo/social-poster.ts` | getActiveExperiment(93)·decide*의 experiment 인자(128–155)·shouldAutoPost(104–115)·**buildCMOContextBlock recentLearnings 렌더링(216–217)**·publishAndSave param(338) + **호출부 인자(588)**·socialPost.create experimentId(410·562)·approval payload(552) — *experimentId 전체 5곳: 338·410·552·562·588* |
| `agents/cmo/knowledge-base.ts` | getCMOContext activeExperiment(67–75)·recentLearnings(93–103) + CMOContext 인터페이스 2필드 |
| `agents/ceo/weekly-report.ts` | snsExperiment(92–97) + 리포트 섹션 |
| `agents/ceo/morning-sns-briefing.ts` | activeExperiments(115–117) + todayPlan 활성실험 줄(130) |
| `agents/strategist/user-deep-analysis.ts` | 읽기(181–186) + return 필드 + AI 프롬프트 섹션(397–400) + system 문구(447) |
| `src/lib/slack-commands.ts` | handleExperiment(517–, 내부 socialPost.**count** 554) + case 'experiment'(658) + 도움말(624) |
| `agents/core/slack-commander.ts` | handleExperiment(528–, **count** 566) + case 'experiment'(652) + 주석(14) |
| `src/lib/queries/admin/admin.dashboard.ts` | getSocialExperiments(341–343) 함수만 |
| `src/components/admin/admin-nav.ts` | 'SNS 테스트'(/admin/experiments) NavItem + adminPageTitles |
| `src/lib/agent-registry.ts` | cmo:social-reviewer(42)·cmo:social-strategy(43) + CMO keys 배열(108) 두 키 |

> ※ slack 핸들러는 `findMany`가 아니라 `count`(554·566) — handleExperiment 통째 제거로 함께 사라짐.

### C. DB 변경 (민감 — 맨 마지막, 창업자 수동, **pg 직접 SQL**)
- **방식**: `prisma migrate`/`db push` 금지(§1 🔴). schema.prisma 수정(타입 생성용) + **Node.js pg 모듈로 직접 DROP SQL 실행** + `information_schema` 검증. `prisma-guide` 스킬(pooler-issues.md) 준수.
- `prisma/schema.prisma` 수정: `model SocialExperiment`(1055–1078) + `SocialPost.experimentId`(1023)·relation(1024)·`@@index([experimentId])`(1050) + `enum ExperimentStatus`(231) 제거. **SocialPost 모델·게시기록 유지.**
- 실제 DB DROP SQL(FK→컬럼→테이블→enum 순): §1 🔴 코드블록 참조.
- → 창업자가 pg 스크립트로 수동 실행 (🔔 **DB 백업 필수**).

### D. GHA + runner
- `.github/workflows/agents-social.yml`: social-strategy job(145–172)·social-reviewer job(117–143) 제거 (poster/metrics/token·schedule 유지)
- `agents/cron/runner.ts`: HANDLERS cmo:social-strategy(80)·cmo:social-reviewer(79)

### E. 유지 확정 (절대 안 건드림)
social-metrics, social-poster(분리 후), 웹 A/B 전체(ExperimentState·assign.ts·registry.ts·admin.experiments-web.ts·TwaEntryGate·OnboardingForm·SignupPromptBanner), constitution sns_platform_strategy·cmo_content_ratios, loadTodayBrief(공용), skills/registry.ts(주석).

---

## 4. 안전 삭제 순서 (DB 마지막, pg 직접 SQL)
1. B 부분수정(참조 제거, `socialExperiment` 범위 한정) →
2. 어드민 페이지·메뉴·agent-registry →
3. GHA job·runner HANDLERS →
4. A 파일 삭제(+ meeting.ts 결정) →
5. schema.prisma에서 모델·enum·컬럼 제거(타입 생성용, `prisma generate`) →
6. 검증(tsc/build) → 커밋·푸시 →
7. **창업자 수동**: pg 모듈로 DROP SQL 실행(§1 🔴) + `information_schema` 검증 (DB 백업 후). **단계마다 tsc 통과 확인.**

## 5. 검증
- `npx tsc --noEmit` 0 + `cd agents && npx tsc --noEmit`
- `npm run build` 성공 (`prisma generate` 포함)
- `npx tsx scripts/check-cron-links.ts` orphan 0 (runner↔workflow 정합성)
- `gh workflow run agents-social.yml -f task=social-poster` → 실험 없이 게시 정상
- 어드민 회귀: SNS 테스트 메뉴 제거 · **`/admin/ab-tests`(웹 A/B) 정상**
- `grep -rn experimentId src/lib/experiments src/app/admin/\(panel\)/ab-tests` → 웹 A/B의 experimentId 무손상
- **DB**: DROP 실행 후 `information_schema.columns`(SocialPost.experimentId 없음)·`information_schema.tables`(SocialExperiment 없음)·`pg_type`(ExperimentStatus 없음) 확인

## 6. 리스크
- 민감영역 3종 동시(에이전트 구조 + DB 변경 + GHA) → `/careful` 게이트 대상.
- `experimentId` 동명이의 랜드마인 → 웹 A/B 오삭제 주의.
- **DB 변경은 `prisma migrate`/`db push` 금지** → pg 직접 SQL만(prisma-guide). migrate 계열 명령 사용 시 pooler 비호환으로 실패.
- DROP은 비가역 → DB 백업 후, 코드가 컬럼 미사용 상태에서만.

## 7. 다음 액션
1. **[창업자]** §2 결정 — A(통째) / B(reviewer만 strip) + (A면) meeting.ts 휴면/정리.
2. 결정 후 §4 순서 단계별 실행(각 단계 tsc).
3. 마지막 DB DROP은 창업자가 pg 스크립트로 수동 실행(`prisma-guide` + `/careful`).
