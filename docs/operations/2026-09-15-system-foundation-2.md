# System Foundation 2.0 — 코드 창고 정리 + 디자인 시스템 연결 (2026-09-15)

> base `origin/main a56e51ad` · 하나의 `[merge 금지]` PR
> **DB·production write 0 · env·스케줄러·에이전트 ON/OFF 변경 0 · 소란소란 저장소 미접근**

Material 3 는 **계층 원칙(reference → system → component)만** 참고했다. MUI 는 설치하지 않았고 시각도 복제하지 않았다.

---

## 1. 레거시·고아 코드 정리

`a56e51ad` 기준으로 17건을 **import / dynamic import / require / 문자열 레지스트리 / workflow / script / 네이티브(Android·iOS) / 설정 / 문서**까지 1,210파일에서 재확인했다.

### 제거 16건

| 파일 | 근거 |
|---|---|
| `hooks/use-media-query.ts` · `lib/auth-rsc.ts` · `lib/queries/cafe-posts.landing.ts` | 저장소 전체 참조 **0** |
| `lib/logger.ts` · `components/admin/Sparkline.tsx` | 매칭은 `@aws-sdk/middleware-logger`·gradle 등 **무관 문자열뿐** |
| `components/features/best/PaginationBar.tsx` | 동명 `features/common/PaginationBar` 가 실사용 중 — 이쪽만 고아 |
| `lib/queries/notifications.ts` · `lib/actions/notifications.ts` | `/my/notifications` 는 `queries/my` 를, 나머지는 `/api/notifications/*` 를 쓴다 |
| `ad/AdClickTracker.tsx` | `/api/ad-click` 은 `DetailHeaderBannerClient`·`ListBannerClient` 가 호출 — **API 는 살아 있고 이 컴포넌트만 중복** |
| `ad/CoupangCPS` · `CoupangCarousel` · `CoupangCategoryBanner` · `CoupangSearchWidget` + `lib/coupang.ts` | 살아 있는 Coupang 컴포넌트(`CoupangBanner`·`Home1`·`Home2`·`DesktopBanner`)는 `./ad-slots` 를 쓴다. `@/lib/coupang` 정확 참조 **0** → **수익 경로와 무관함이 증명됨** |
| `common/ShareButton.tsx` | 공유는 `ActionBar` 가 `@/lib/kakao-share` 로 한다. 확정된 재도입 계획 없음 |
| `features/landing/LandingClient.tsx` | `/landing` 은 `redirect('/')` 뿐. 이 파일은 **CafePost 직접 조회** 코드이고 페이지 주석이 "CafePost 직접 조회로는 복구하지 않는다" 고 못 박았다 — 삭제가 그 계약을 강화한다 |

### 유지

- `types/next-auth.d.ts` — **ambient declaration**. import 되지 않는 게 정상이다.
- `.env.local` 의 `COOK82_COLLECTOR_ENABLED` · `COOK82_BRIDGE_ENABLED` · `SHEETS_SCRAPER_ID` — 이 저장소 참조 0이지만 **소란소란 쪽 소비 가능**. 확인 없이 건드리지 않았다.

### 결합부 동시 수정

- `scripts/design-token-audit.ts` — 사라진 `landing` 3개 제외 규칙 제거
- `src/__tests__/r8-telemetry-v2.test.ts` — 삭제된 호출부 제외, 임계값 9 → **8**(실측). `landing_modal`·`landing_sticky_bar` 는 호출부가 사라졌고, `KAKAO_CLICK_SOURCES` 상수는 과거 이벤트 해석을 위해 남긴다.

🔴 **삭제 파일명을 영구 금지하는 테스트는 만들지 않았다.** 기능 계약(라우트·API 호출처·알림 경로)으로 검증한다.

---

## 2. 디자인 토큰 체계

`globals.css` `:root` 를 **reference → system → component** 로 재구성했다. 🔴 **기존 토큰 값은 하나도 바뀌지 않았다**(스크립트로 전수 대조) — 외형 동등이 전제다.

| 구분 | 내용 |
|---|---|
| 제거 **11** | `--font-size-xs/sm/base/lg`(연결된 CSS 모듈이 **존재하지 않음**) · `--hero-slide-1~3`(`--hero-N-*` 로 대체됨) · `--pulse-dot-*` · `--shadow-fab` · `--badge-editors` |
| 추가 **15** | control-size 5 · spacing/layout 3 · shape 1 · elevation 3 · state 3 |
| 총계 | 112 → **116** |

### 계약 정본 — `src/lib/design-tokens.ts`

- **HSL triplet** 토큰은 `hsl(var(--x))` 로만. `var(--x)` 로 쓰면 **색이 안 나온다.**
- 카카오 색은 처음에 reference 로 뒀다가 **component 로 내렸다** — "직접 쓰지 마라"(reference)와
  "이 버튼은 이 색이어야 한다"가 모순됐다. 지금 `REFERENCE_TOKENS` 는 비어 있다.
- **완성값** 토큰은 `var(--x)` 로만. `hsl()` 로 감싸면 무효.
- 이 계약으로 **실제 버그 1건**을 찾았다 — `TipTapEditor.tsx:800` 이 `var(--muted-foreground)` 를 `hsl()` 없이 써서 색이 죽어 있었다. 고쳤다.

### 🔴 1차 진단 정정

1차 진단은 "참조 0 토큰 27개" 라고 보고했다. **틀렸다.** `IconMenu` 가 토큰 이름을 **문자열 레지스트리**(`strokeVar: '--icon-best-stroke'`)로 들고 다니며 런타임에 `var()` 를 만드는데, `var(--x)` 형태만 세는 스캔이 이를 놓쳤다. `--icon-*`·`--cat-*` 14개는 **정상 사용 중**이다. 계약 테스트는 이제 두 형태를 모두 센다.

### spacing 오판 정정

1차 진단의 "spacing 토큰 0" 도 오해를 부른다. **Tailwind 기본 spacing scale 이 이미 토큰 체계다.** 그것을 대체하지 않고, 스케일로 표현되지 않는 반복 치수만 추가했다(`--space-row-y` 18px · `--content-max` 720px · `--content-max-wide` 960px).

### CSS 변수를 쓸 수 없는 문맥

`NO_CSS_VAR_CONTEXTS` 로 분류했고 audit 이 색 규칙에서 제외한다.

| id | 사유 |
|---|---|
| `og-satori` | `next/og`·Satori 는 CSS 변수를 해석하지 않는다 (`opengraph-image` 2파일) |
| `svg-attribute` | SVG presentation attribute 가 CSS 변수를 못 받는 경우가 있다 |
| `external-brand` | 카카오 등 외부 브랜드 규정색은 우리가 바꿀 수 없다 — reference 토큰으로만 둔다 |

🔴 `#FF6F61` 등 **119개를 일괄 치환하지 않았다.** audit 이 새 위반만 막는다.

---

## 3. 공통 UI 계약과 실제 채택

### 강화한 것 (새 추상화 없음)

- **Button** — `density`(touch/compact) 추가, 크기를 밀도 토큰으로, disabled·focus 를 state 토큰으로, `aria-busy` 추가. `IconButton` 은 `Button` 위의 얇은 계약으로 **접근 이름을 강제**한다.
- **Input** — `Textarea`·`Select` 를 같은 계약으로 추가. `FieldShell` 로 label·error·success 배치를 공유. **error 가 `aria-invalid`+`aria-describedby` 로 묶인다** — 색만 바꾸면 스크린리더 사용자는 무엇이 틀렸는지 알 수 없다.

### 밀도 분리

공개면 52px 컨트롤 279회 vs admin 10~11px 텍스트 33회 — 실측으로 이미 다르다.
🔴 **admin 에 52px 를 강제하지 않는다.** 같은 토큰·같은 primitive 를 쓰되 `density="compact"`(36px) 로 가른다.

### 실제 채택 — 306곳

공개면의 하드코딩 컨트롤 크기 **306곳**을 밀도 토큰으로 옮겼다(108파일). **값은 전부 동일한 px** 라 외형 변화가 없다.

| 이전 | 이후 | 공개면 |
|---|---|---:|
| `min-h-[52px]` | `min-h-control` | 165 |
| `h-[52px]` | `h-control` | 63 |
| `w-[52px]` / `min-w-[52px]` | `w-control` / `min-w-control` | 34 |
| `min-h-[56px]` / `h-[56px]` | `min-h-control-lg` / `h-control-lg` | 18 |
| `min-h-[44px]` / `min-w-[44px]` | `min-h-control-sm` / `min-w-control-sm` | 20 |
| `lg:h-12` | `lg:h-control-desktop` | 6 |

### 🔴 `<Button>`/`<Input>` 로의 전면 전환은 하지 않았다 — 근거

기존 공개면 컨트롤은 **개별 스킨**을 갖고 있다. 표본 조사 결과:

- `PostWriteForm` 등록 버튼 — `w-full h-[56px]` 무라운드 풀바, disabled 를 `bg-muted` 로 표현(공용은 `opacity-disabled`)
- `GuestCommentInput`·`GuestPasswordModal` — `rounded-xl text-caption`(공용 기본은 `rounded-lg text-body`)
- `OnboardingForm` 닉네임 — `border-2 rounded-xl` 3상태 보더
- `JobSearchBar` — 검색창과 한 몸인 `-mr-4 rounded-r-xl` 아이콘 버튼

이들을 `<Button>` 으로 바꾸면 **모서리·글자 크기·disabled 표현이 달라진다.** 이번 배치는 리디자인이 아니므로 바꾸지 않았다. 대신 **audit 의 changed-file strict** 가 앞으로 새로 만들거나 손대는 컨트롤에 계약을 강제한다. 특수 인터랙션의 예외 사유는 각 컴포넌트 주석에 남겼다.

---

## 4. audit 과 CI

### false-green 제거

| 문제 | 이전 | 이후 |
|---|---|---|
| 게이트 | violation 이 있어도 **항상 exit 0** | `--strict` 에서 **exit 1** |
| 자동 실행 | CI·husky 어디에도 없음 → **0회** | `ci.yml` `design-audit` job |
| 검사 범위 | 375개 중 97개(25%) 제외 · admin 89개 통째 | **540파일** · admin 포함 |
| `src/lib` | **범위 밖**(179파일 미검사) | 포함 |

### 새 규칙

| id | 이름 | 심각도 |
|---|---|---|
| R08 | `hardcoded-tokenized-color` — 토큰이 이미 있는 색의 HEX | error |
| R09 | `hardcoded-control-size` — 밀도 토큰이 있는데 px 직접 | error |
| R10 | `hsl-token-misuse` — HSL 토큰을 `hsl()` 없이 | error |
| R11 | `raw-standard-control` — 표준 컨트롤 직접 구현 | **warn** |

R11 을 warn 으로 둔 이유: 기존 화면은 컨트롤마다 스킨이 달라 한 번에 바꾸면 외형이 바뀐다. **새로 만드는 것**만 막는 게 목적이다.

R08 은 **스타일 문맥에서만** 잡는다 — 안내 카피 안의 색 코드가 오탐으로 잡히던 것을 고쳤다.

**기존 규칙 R02 의 오탐도 고쳤다.** 줄 전체로 class token 을 모아서
`active ? 'bg-primary/90 text-white' : 'bg-white text-foreground'` 처럼 **삼항의 서로 다른 분기**가
합쳐져 위반으로 잡혔다. 이제 quoted string **하나 단위**로 본다.

### 이 게이트가 이번 PR 을 실제로 막았다

`--strict` 를 켜자 내가 손댄 파일에서 **29건**이 걸렸다. 전부 고쳤다.
- R09 17건 — 변형 접두사(`md:` 등)가 붙은 클래스를 1차 치환 정규식이 건너뛰었다. 48/44/36px 포함해 재치환
- R08 12건 중 10건 — **카카오 규정색** `#FEE500`·`#191919`. `--kakao-bg`·`--kakao-text` 토큰이 이미 있었는데 쓰지 않고 있었다. **24곳을 토큰으로 채택**(동일 값)
- 나머지 — `caret-color` 와 그라디언트의 `#FF6F61` → `hsl(var(--primary))`

그 결과 전체 ERROR 가 **104 → 72** 로 줄었다.

### baseline + changed-file strict

- 기본 실행은 report-only(exit 0) — 전체 부채를 보여준다(**ERROR 72 · WARN 821** · R11 **479**)
- `--strict` 는 ① **변경한 파일의 위반** ② **baseline 초과(새 부채)** 둘 중 하나라도 있으면 exit 1
- 🔴 게이트 대상은 **error 전부 + R11**(raw 표준 컨트롤)이다. R11 은 severity 가 warn 이지만
  **개수 증가를 막는다** — 기존 부채는 baseline 으로 허용하고 **새 raw 컨트롤만** exit 1.
  나머지 warn(R04~R07)은 리포트 전용이다. 게이트로 삼으면 파일을 한 줄만 고쳐도 CI 가 막힌다.
- baseline 은 `파일::규칙` 단위(**117항목** — R11 89 · R08 20 · R09 6 · R03 2)
- 테스트는 `--root=` 로 **임시 fixture** 를 검사한다. 실제 소스를 임시 수정하는 방식은
  vitest 병렬 실행에서 다른 테스트를 깨뜨렸다(CI 실패로 드러났다)
- CI 는 `git diff --diff-filter=ACMR origin/<base>...HEAD` 로 변경 파일을 넘긴다

### 자체 계약 테스트

`design-audit-contract.test.ts` 16건. **양성 대조**로 위반을 주입해 `exit 1` 을 실제로 확인한다 — 검사 도구가 조용히 아무것도 안 하는 사고는 검사 대상보다 위험하다.

---

## 5. 리팩토링·주석

- 대형 파일 분리는 **하지 않았다.** 이번 배치에서 건드린 파일 중 책임 경계가 명확히 갈리는 것이 없었다. 근거 없이 쪼개면 리뷰만 어려워진다.
- 코드를 그대로 읽는 라벨 주석 제거(`// 상수`·`// 컴포넌트`).
- 🔴 **같은 사고 설명을 반복하지 않는다** — `/dev` 차단 설명이 `dev-routes.ts`·`middleware.ts`·테스트 3곳에 중복돼 있었다(내가 만든 중복이다). 계약 파일 하나에 두고 나머지는 가리키게 했다.
- 보안·정책·장애 원인·회귀 방지 주석은 그대로 유지했다.

### AGENTS.md 자동 변경 — 생성 주체 규명

| 항목 | 내용 |
|---|---|
| 생성 주체 | **`next@16.3.4`** — `node_modules/next/dist/server/lib/app-info-log.js:126-128` 이 `generate-agent-files.writeAgentFiles()` 호출 |
| 조건 | `getAgentName() !== null` (AI 에이전트 환경 감지 · `@vercel/detect-agent`) **그리고** `hasCurrentAgentRules(dir) === false` |
| 비활성 스위치 | `generate-agent-files.js`·`app-info-log.js` 에 **환경변수·설정 없음** |

**저장소가 통제할 수 있다.** 생성기는 멱등이라 블록이 이미 있으면 아무것도 쓰지 않는다 — 그래서 **블록을 커밋했다.** `.gitignore` 로 덮지 않았다(tracked 파일이라 그 방법은 맞지도 않는다).

실증: 커밋 후 `next dev` 재실행 → `AGENTS.md` unstaged 변경 **0건**.

---

## 6. 전후 비교

| 항목 | 이전 | 이후 |
|---|---|---|
| 삭제 파일 | — | **16** |
| `:root` 토큰 | 112 | **116** (제거 11 · 추가 15) |
| tailwind 노출 토큰 | 37 | **52** |
| 공개면 하드코딩 컨트롤 크기 | 306 | **0** |
| audit 검사 파일 | 278 | **540** |
| audit 제외율 | 25% | 생성물·테스트·정본만 |
| audit 규칙 | 7 | **10 + AST 규칙 1**(R11) · R02 오탐 수정 |
| audit ERROR | 104 | **72** · WARN 821 · R11 479 |
| audit 게이트 | 없음(항상 exit 0) | baseline + changed-file strict |
| 테스트 | 100파일 1,890건 | **103파일 1,968건** |
| 카카오 색 토큰 채택 | 0곳 | **24곳** |

### 디자인 계약 채택률

| 구역 | 밀도 토큰 채택 | 비고 |
|---|---|---|
| public | **306/306 (100%)** | 하드코딩 컨트롤 크기 0 |
| admin | 11곳 미변환 | compact variant 제공, **52px 강제 안 함**(의도) |

---

## 7. 하지 않은 것 (금지 항목 준수)

- `write-draft.ts` · `actions/drafts.ts` 통합·삭제 — **둘 다 생존**
- `alert-dialog.tsx` · `sheet.tsx` 의 `use client` 제거 — **둘 다 유지**
- admin 에 52px 일괄 적용 — 하지 않음
- 색상 119개 일괄 치환 — 하지 않음
- 회원 반응 노출 작업 — 하지 않음
- DB · env · 스케줄러 · 에이전트 ON/OFF · production write — **0**
- 소란소란 저장소 접근 — **없음**
- 증거 없는 패키지 삭제 — package.json **무변경**(미사용 의존성 0)
- 제품 기능 · URL · SEO 동작 변경 — 없음


---

## 8. Codex 리뷰 보정 (2026-09-15)

| # | finding | 처리 |
|---|---|---|
| 1 | audit 의 즉시 `process.exit()` | **전부 제거.** `main()` 이 exit code 를 **반환**하고 최상단이 `process.exitCode` 에 담는다. 파이프로 나가는 stdout 은 비동기라 `process.exit()` 가 미완료 버퍼를 버렸고 — CI 에서 요약 줄이 통째로 사라졌다. **재현 테스트 4건**으로 고정했다(즉시 종료 부재 · report 마지막 줄 · strict 요약 · `--output=json` 파이프 전체 파싱). "재실행 성공" 으로 종결하지 않았다 |
| 2 | R11 을 실질 게이트로 | **TypeScript JSX AST** 로 재구현(`findRawControls`). multiline JSX 를 잡는다. baseline 으로 기존 부채(89파일)는 허용하되 **개수 증가는 exit 1**. 테스트 8건: multiline · baseline 유지 · 1건 추가 실패 · 1건 제거 통과 · 공용 `ui/` primitive 예외 · 4종 태그 전수 · **R11 은 변경 파일 존재만으로는 막지 않는다** · error 는 막는다 |
| 3 | 폼 id | 명시적 id 가 없으면 **항상 `React.useId()`**. label 문자열 기반 id 는 같은 라벨 2개에서 충돌해 `htmlFor` 가 엉뚱한 입력을 가리켰다. 렌더 테스트 7건 |
| 4 | 삭제 모듈을 현행으로 적은 문서 | active **9개** 갱신(R01·R02·F03·F07·specs/03·specs/10·SERVICE_ARCHITECTURE·UNAO_RESCUE_STATUS·**NOTIFICATION_SPEC**). 역사 문서 5개에는 **역사 배너** |
| 5 | `visual-run.mjs` | **삭제.** 일회성 진단 도구였고 정식 편입할 만큼의 계약(인자 검증·문서·npm script)을 갖출 이유가 없었다 |
| 6 | 카카오 설명 · icons 예외 · state 토큰 | 카카오 분류 설명을 **한 곳**으로 통일 · `icons/` 전체 예외는 **하드코딩 색 0건**이라 근거가 없어 제거 · state 토큰 3개가 `LITERAL_VALUE_TOKENS` 에서 빠져 있던 것을 추가하고 **전수 검증 테스트**를 넣었다 |
| 7 | PR·문서 stale 수치 | 최종 실측으로 갱신(위 표) |

### 검증

- Node **v24.14.0** · vitest **1,949건 3회 연속 PASS**
- `--output=json` 파이프 파싱 PASS
- audit strict 양성/음성 대조 PASS
- typecheck 0 · ops-typecheck 0 · lint 0


### R11 게이트 범위 — 한 번 더 정정

CI 가 이 PR 을 막았다. 원인은 R11 을 **변경 파일에 있으면 실패**로 적용한 것이었다.
R11 의 계약은 **개수 증가 금지**다(baseline 비교). 존재만으로 막으면 raw 컨트롤이 있는 화면 파일을
토큰 치환 같은 **무관한 이유로 한 줄만 고쳐도** CI 가 멈춘다 —
"기존 부채를 한 번에 red 로 만들지 않는다" 는 전제와 정면으로 어긋난다.

| 규칙 | 변경 파일에 존재 | baseline 초과 |
|---|---|---|
| error (R02·R03·R08·R09·R10) | **exit 1** — 고치기 싸고 국소적이다 | exit 1 |
| R11 (raw 표준 컨트롤) | 통과 | **exit 1** |

두 경우를 각각 테스트로 고정했다. 공용 예외도 `Button`·`Input` 에서
**`src/components/ui/` 전체**로 넓혔다 — `Chip`·`BottomSheet` 도 표준 컨트롤을 만드는 게 일이다.

### 시각 회귀 — production 대비 0건

Preview 320·390·1440 × 5화면(home·community·magazine·jobs·login) 실측:
가로 넘침 **0→0** · 텍스트 넘침 **0→0** · 44px 미만 컨트롤 **동일** · 전 페이지 200.
홈 컨트롤 수가 44→43 으로 보였으나 대기 시간을 늘려 재측정하니 **컨트롤 집합이 완전히 동일**했다 —
광고 슬롯 렌더 타이밍 차이였다.


## 9. Codex 재리뷰 보정 (2026-09-15)

| # | finding | 처리 |
|---|---|---|
| 1 | R11 changed-file 게이트 | 로직은 앞 커밋(`80f0c3b2`)에 이미 반영. 남아 있던 **"게이트는 error 만" stale 주석**을 실제 정책표로 교체했다 |
| 2 | CI 조합 재현 테스트 | `--changed` 없이만 검증하면 CI 가 실제로 도는 형태를 못 본다. **4+1 조합**을 고정했다 |
| 3 | icons 예외 false-green | 소스 문자열 검사를 버리고 **fixture 행동 테스트**로 바꿨다 |
| 4 | 현행 문서 잔존 | `R02:207` CoupangCPS 안내 · `NOTIFICATION_SPEC` 의 Server Action 2개를 실제 API 로 교체 |

### strict 게이트 판정표 (정본)

| 규칙 | 변경 파일에 존재 | baseline 초과 |
|---|---|---|
| error (R01·R02·R03·R08~R10) | **FAIL** | FAIL |
| R11 (raw 표준 컨트롤) | 통과 | **FAIL** |
| 리포트 전용 warn (R04~R07) | 통과 | 통과(미집계) |

### CI 조합 재현 테스트

| baseline | 현재 | `--changed` | 기대 | 결과 |
|---|---|---|---|---|
| R11 1 | 1 | 포함 | exit 0 | PASS |
| R11 1 | **2** | 포함 | **exit 1** (`1 → 2`) | PASS |
| R11 1 | 0 | 포함 | exit 0 (부채 갚기) | PASS |
| **R08 1** | 1 | 포함 | **exit 1** | PASS |
| R08 1 | 1 | 미포함 | exit 0 | PASS |

### 예외는 선언이 아니라 행동으로 검증한다

"소스에 `icons/` 문자열이 없다" 는 검사는 **false-green** 이다 — 예외가 다른 이름·다른 경로로 살아 있어도 통과한다.
fixture 에 실제 위반을 넣고 잡히는지/통과하는지로 본다.

| fixture | 기대 | 결과 |
|---|---|---|
| `src/components/icons/Heart.tsx` 에 `#FF6F61`·`#FEE500` | **R08 검출 · strict exit 1** | PASS |
| `opengraph-image.tsx` 에 같은 HEX | **R08 0건 · strict exit 0** (Satori 는 CSS 변수를 못 읽는다) | PASS |
| 둘을 같이 두기 | OG 만 빠지고 나머지는 잡힘 — 예외가 경로 한정임을 확인 | PASS |

**red→green**: `icons/` 예외를 되살리면 행동 테스트 **2건 red**.


## 10. Codex 재리뷰 잔여 4건 (2026-09-15)

| # | finding | 처리 |
|---|---|---|
| 1 | R11 `ui/` 전체 예외 | **디렉터리 prefix 면제 제거.** `파일 × 허용 태그` allowlist 로 좁혔다 — `Input.tsx`(input·textarea·select) · `Chip.tsx`(button). 실측으로 이 둘이 전부였다 |
| 2 | baseline 자체의 증가 차단 | `--compare-baseline=` 추가 + CI step. 기존 키 증가·신규 키 **FAIL**, 값 감소·키 제거 **PASS**, 기준 브랜치에 baseline 없으면 **PASS**(최초 도입) |
| 3 | 문자열 기반 icons 테스트 | **제거.** fixture 행동 테스트가 정본이다 |
| 4 | 문서·PR 실측 동기화 | §8 의 `NOTIFICATION_SPEC` 무변경 서술 정정(실제로는 갱신했다) + 아래 실측값 |

### R11 allowlist — 디렉터리 통째 면제를 쓰지 않는 이유

`src/components/ui/` 를 통째로 빼면 **거기 생기는 아무 파일이나** raw 컨트롤을 자유롭게 만들 수 있다. 규칙이 있으나 마나가 된다.

| fixture | 기대 | 결과 |
|---|---|---|
| `ui/Input.tsx` 의 `input` · `ui/Chip.tsx` 의 `button` | 통과 | PASS |
| **`ui/AccidentalFeature.tsx` 의 `button`** | **검출 · exit 1** | PASS |
| `ui/Chip.tsx` 의 `input`(허용 태그 아님) | **검출** | PASS |
| `ui/Button.tsx` 의 `button`(allowlist 밖) | **검출** | PASS |

### baseline 증가 차단 — 왜 필요한가

strict 게이트는 "현재 위반 vs 커밋된 baseline" 을 본다. 새 위반을 만들고 **baseline 도 같이 올려서** 커밋하면 그 게이트는 통과한다 — 부채가 조용히 는다. 100줄 넘는 JSON 의 숫자 하나가 늘어난 걸 사람이 놓치므로 **수동 리뷰만으로는 못 막는다.**

| 시나리오 | 기대 | 결과 |
|---|---|---|
| 기존 키 값 증가 (1 → 2) | **FAIL** | PASS |
| 신규 키 추가 | **FAIL** | PASS |
| 값 감소 | 통과 | PASS |
| 키 제거 | 통과 | PASS |
| 기준 브랜치에 baseline 없음 | 통과(최초 도입) | PASS |
| **새 R11 + 갱신된 baseline 을 같은 PR 에** | strict 는 통과하지만 **비교가 FAIL** | PASS |

### 최종 실측

| 항목 | 값 |
|---|---|
| baseline | **117항목** — R11 **89** · R08 **20** · R09 **6** · R03 **2** |
| R11 실제 위반 | **479건** |
| audit | 540파일 · ERROR **72** · WARN **821** |
| 테스트 | **103파일 1,968건** |


## 11. CI 자기보호 보정 (2026-09-15)

| # | finding | 처리 |
|---|---|---|
| 1 | 디자인 감사 전용 path filter | `design-audit` job 이 `frontend` 로 돌면 **감사 도구 자신의 변경을 놓친다** — `src/**`·`public/**`·`e2e/**` 뿐이라 audit 스크립트·baseline·tailwind 설정이 안 걸린다. **전용 `design` 필터**를 만들고 job 조건을 바꿨다 |
| 2 | baseline 기준 파일 **fail-closed** | "못 읽었으니 넘어가자" 로 두면 ref 추출이 조용히 실패했을 때 증가 차단이 통째로 무력화된다. 없는 파일·깨진 JSON·객체 아님 → **전부 exit 1**. 최초 도입 판정은 **CI 가** 한다(ref 정상 + baseline 파일만 없음) |
| 3 | stale 주석 | 스크립트 상단과 `ci.yml` 을 실제 정책표로 갱신 |

### 왜 전용 filter 가 필요했나

| 가상 변경 | `frontend` | `design` | design-audit |
|---|---|---|---|
| `scripts/design-audit-baseline.json` 만 | false | **true** | **실행** |
| `scripts/design-token-audit.ts` 만 | false | **true** | **실행** |
| `tailwind.config.ts` 만 | false | **true** | **실행** |
| `.github/workflows/ci.yml` 만 | false | **true** | **실행** |
| `docs/**` · `README.md` 만 | false | false | skip |

🔴 위 네 줄이 전부 **이전 구조에서는 skip** 됐다 — baseline 만 몰래 올리는 PR 이 검사 없이 통과할 수 있었다.

### baseline 기준 파일 — 4경우

| 경우 | 판정 | 누가 |
|---|---|---|
| 기준 ref 자체를 못 읽음 | **FAIL** | CI (`git rev-parse --verify`) |
| ref 정상 + baseline 파일 없음 | **PASS**(최초 도입) | CI (`git cat-file -e`) |
| baseline 있는데 추출 실패 | **FAIL** | CI (`git show`) |
| 추출됐는데 JSON 파싱 실패·객체 아님 | **FAIL** | 스크립트 |

`set -euo pipefail` 로 중간 실패가 조용히 삼켜지지 않게 했다.
