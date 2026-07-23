# 참여 이벤트 QA 체크리스트 (절대 준수 — 기능 구현 후 필수)

> 대상: **참여 이벤트 3종 = VOTE(투표형) / FEEDBACK(의견수렴형) / SURVEY(1분 의견함)** 및 그 노출 계층(Event·팝업·HERO·/events 상세).
> 트리거: 위 타입의 코드/렌더/어드민/노출 로직을 신규 구현·수정할 때. 버그수정·리팩토링 포함.
> 원칙: **에러 없음 ≠ 성공.** 최종 사용자 화면(모바일 실측)까지 검증한다. `.claude/rules/debug-silent-failure.md` 병행.

---

## 필수 10항목 (전부 PASS/FAIL 표로 보고)

| # | 항목 | 합격 기준 | 검증 방법 |
|---|---|---|---|
| 1 | **모바일 375px 실측 스크린샷** | 과밀·잘림·overflow 없음 | Playwright 375 resize → screenshot + `document.documentElement.scrollWidth > innerWidth` = false |
| 2 | **HERO/팝업 = 입구 전용** | 폼·질문·투표위젯 없이 라벨+짧은제목+CTA만 | HERO/팝업 DOM에 textarea/질문 목록 없음 확인 |
| 3 | **긴 설명 HERO/팝업 미노출** | Event.description 원문이 HERO/팝업에 안 뜸 | 홈 HTML·팝업 DOM에 description 문자열 0건 |
| 4 | **한글 직접 입력 20자↑** | 전체 문자열 유지(1글자 멈춤 없음) | `pressSequentially`(한 글자씩) 후 `el.value.length` 확인 |
| 5 | **입력 중 선택지/동의 클릭 후 값 보존** | 버튼 클릭해도 textarea 값 안 사라짐 | 텍스트 입력 → 선택/평점/동의 클릭 → `el.value` 재확인 |
| 6 | **CTA 클릭 경로** | 팝업/HERO → `/events/[id]?src=...` 이동 | 클릭 후 URL 확인 |
| 7 | **어드민 내부 용어 점검** | PRIMARY/SECONDARY/showHero 등 raw 값이 운영자에게 그대로 노출 안 됨(의미 라벨 병기) | 어드민 폼 텍스트 확인 |
| 8 | **노출 상태표 보고** | tier·showHero·showBottomPopup·startAt·endAt·isActive 실측값 표 | DB 조회 또는 `?channel=` exposed API |
| 9 | **누수 0** | 사는이야기/검색/sitemap에 이벤트 본문·id 안 뜸 + 상세 `noindex,nofollow` | curl + **매치 컨텍스트 출력**(grep `head -1 && echo` 금지 — false positive) |
| 10 | **기존 타입 회귀 0** | VOTE `/api/votes/today` + FEEDBACK/SURVEY exposed(키 유지) 정상 | curl 세 타입 각각 |

---

## QA 픽스처 규칙 (프로덕션=preview 동일 Supabase DB)

- 픽스처 Event는 **`tier=HIDDEN`·show*=false로 생성** → /events/[id] 직접 접근으로 입력/제출/중복 검증(실사용자 노출 0).
- HERO/팝업 실측이 필요할 때만 **최소 시간 PRIMARY+showHero/Popup으로 전환 → 확인 → 즉시 삭제**. 홈은 `revalidate=300`(ISR)이라 반영에 최대 5분 지연(회귀 아님).
- **QA 후 픽스처 반드시 삭제** + `exposed`가 null(노출 종료)인지 확인. 제목에 `[QA-...]` 태그로 식별.
- 픽스처 스크립트는 **scratchpad worktree(origin/main 기준, `prisma generate` 완료본)** 에서 실행. ⚠️ 메인 repo의 `src/generated/prisma`는 stale(Event/Survey 모델 없을 수 있음).
- 스크립트 패턴은 기존 `scripts/*.ts` 복사: `import { PrismaClient } from '../src/generated/prisma/client'` + `new PrismaPg({ connectionString })` adapter + `dotenv config({ path })`. `.mts`/절대경로 import 금지(tsx ESM named export 실패).

## 자사 API 테스트 전

- `/api/events/exposed` 등 자사 API는 **route.ts를 먼저 읽어 필수 쿼리 파라미터 확인**(예: `?channel=bottomPopup|hero` 없으면 정상적으로 둘 다 null → 회귀 오판 금지).

---

## 자동화 — 노출 리스크 0 격리 3계층 (권장)

QA는 **실사용자 노출을 만들지 않고** 3계층으로 나눈다. PRIMARY 실노출·홈 ISR 반영을 아예 만들지 않는다.

| 계층 | 검증 대상 | 방식 | 노출 |
|---|---|---|---|
| **A. 상세 화면** | /events/[id] 입력·제출·중복·미노출·noindex | `tier=HIDDEN` fixture → 팝업/HERO 탈락(getExposedEvent PRIMARY 필터), 상세는 noindex·비링크·sitemap 제외 | 0 |
| **B. 입구 UI** | HERO 라벨·2줄·짧은문구·CTA·긴설명 미노출 | `/dev/event-preview`(noindex·비링크)에서 HeroSliderClient에 fixture prop 직접 렌더 | 0 |
| **C. 노출 로직** | getExposedEvent가 PRIMARY+show{채널} 잡는지 | resolver 순수 함수 Node 실행(홈·API 무경유, read-only) | 0 |

### 실행

```bash
# Playwright spec (계층 A+B) — 계층 A는 DATABASE_URL 있어야 실행, 없으면 skip
QA_EVENT_URL=<preview-or-prod> DATABASE_URL=<pooler-6543> \
  npx playwright test --project=qa-participation-events
# 로컬 편의: QA_ENV_FILE=/경로/.env.local 로 env 파일 지정 가능
```
- spec: `e2e/qa/21-participation-events.spec.ts`. 계층 A는 beforeAll에서 HIDDEN fixture 생성 → afterAll 삭제(자동 정리).
- 계층 B 프리뷰: `src/app/dev/event-preview/`(noindex). 새 타입 추가 시 여기 슬라이드도 추가.

### 재사용 fixture 도구 — `scripts/qa-event-fixture.ts`

```bash
npx tsx scripts/qa-event-fixture.ts create [survey|feedback]  # HIDDEN 생성(기본 survey)
npx tsx scripts/qa-event-fixture.ts status                    # 상태표
npx tsx scripts/qa-event-fixture.ts hero-on | popup-on        # ⚠️ 실노출 — 확인 후 즉시 hide/delete
npx tsx scripts/qa-event-fixture.ts hide                      # HIDDEN 복귀(노출 종료)
npx tsx scripts/qa-event-fixture.ts delete                    # QA 픽스처 전부 삭제
```
- **기본은 HIDDEN.** `hero-on/popup-on`은 실사용자 노출 → 입구 UI는 계층 B(프리뷰)로 대체 권장.
- ⚠️ **메인 repo의 `src/generated/prisma`는 stale** — origin/main 기준 worktree에서 `prisma generate` 후 실행. import는 `../src/generated/prisma/client`(확장자 없음), `new PrismaPg({ connectionString })` adapter 필수.

> **QA 후 반드시**: fixture `delete` + `exposed`가 null(노출 종료) 확인. 프로덕션에 fixture를 남기지 말 것.
