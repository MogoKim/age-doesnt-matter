# 후속 workflow 항목 — E2E Admin path filter 가 어드민 표면 대부분을 놓친다

- 상태: **Backlog (이번 PR 에서 고치지 않는다)**
- 발견: 2026-09-16, Admin Console Foundation 2.1 (PR #486) 검증 중
- 분류: CI workflow 변경 → `.claude/rules/autonomy.md` §2-B **AUTO 금지** 영역. 창업자 승인 필요.

## ⚠️ 이 문서의 이전 판(2026-09-16 최초 작성)은 틀렸다 — 정정

최초 판은 AS-IS 를 "`admin` 필터가 `src/app/(admin)/**` 뿐이라 **관리자 page 를 포함해** 못 본다" 로 적었다.
그 뒤 dorny/paths-filter 와 **동일한 매처로 실측**한 결과 두 가지가 확인됐다.

1. **`src/app/(admin)` 이라는 디렉터리는 존재하지 않는다.** 실제 관리자 route 는 `src/app/admin/**` 이다.
2. **그럼에도 현재 필터는 관리자 page 를 놓치지 않는다.** `dorny/paths-filter@v3` 는
   `picomatch(pattern, { dot: true })` 를 쓰는데, picomatch 는 앞에 `?`·`!`·`+`·`*`·`@` 가 없는
   맨 `(admin)` 을 **캡처 그룹**으로 컴파일한다. 결과적으로 리터럴 `admin` 세그먼트에 매칭된다.

```
picomatch('src/app/(admin)/**', {dot:true})
  'src/app/admin/page.tsx'          → true
  'src/app/admin/content/page.tsx'  → true
  'src/app/(admin)/admin/page.tsx'  → false   ← 표기대로의 경로는 오히려 안 잡힌다
  'src/components/admin/ContentTable.tsx' → false
```

`git ls-files` 전수 대조: 현재 필터가 잡는 파일 **48개 = `src/app/admin/**` 전부**.

즉 **"관리자 page 를 놓친다" 는 틀렸다.** 실제 결함은 두 가지다.

- **표기가 거짓이다.** 존재하지 않는 Next.js route group 을 가리키는 것처럼 보이고,
  실제로는 picomatch 의 그룹 문법 부작용으로만 살아 있다. 매처가 바뀌거나 누군가
  "route group 이 없네" 하고 괄호를 `src/app/(admin)/` 실경로로 '고치면' **소리 없이 죽는다.**
- **page 층 말고는 전부 놓친다.** 어드민 화면의 본체(컴포넌트·쿼리·server action·API·미들웨어)와
  **E2E 하네스 자신**이 필터 밖이다.

## 실측 AS-IS (2026-09-16, `.github/workflows/ci.yml`)

```yaml
# detect-changes → dorny/paths-filter@v3
admin:
  - 'src/app/(admin)/**'     # 실측 48파일 = src/app/admin/** (우연히 매칭)
```

`admin` 출력을 소비하는 job 은 **둘**이다 — 넓히면 둘 다 영향을 받는다.

| 줄 | job | 조건 |
|---|---|---|
| 92 | `quality` (Lint→Typecheck→Test→Build) | `frontend \|\| prisma \|\| admin` |
| 358 | `e2e-admin` | `admin == 'true' && vars.E2E_ADMIN_ENABLED == 'true'` |

## 문제 정의

`e2e-admin` 은 `npx playwright test --project=qa-admin --workers=1` 을 돌린다.
`playwright.config.ts` 의 `qa-admin` 은 `testMatch: /qa\/(0[6-9]|1[0-4])-.*\.spec\.ts/` 이고
`dependencies: ['setup-admin']`(= `e2e/fixtures/auth.setup.ts`) 를 갖는다.

그 spec 들이 실제로 방문하는 관리자 경로(전수):

```
/admin  /admin/agents  /admin/analytics  /admin/audit-log  /admin/banners
/admin/content  /admin/daily-brief  /admin/members  /admin/popups
/admin/queue  /admin/reports  /admin/settings
```

이 화면들의 동작을 좌우하는 코드는 `src/app/admin/**` 의 얇은 page 층이 아니라
그 아래의 컴포넌트·쿼리·server action·API·미들웨어다.
`src/app/admin/**` 과 `src/components/admin/**` 의 `@/` import 를 세어 보면:

```
45 components/admin   32 lib/queries   23 lib/actions   11 lib/prisma   11 lib/admin-auth
```

**PR #486 이 그 예다.** 어드민 후보 5개 화면 중 4개를 전환했는데
`src/app/admin/**` 은 한 줄도 건드리지 않아 `admin` 필터가 `false` 였다.

## TO-BE (제안 — 승인 후 실행)

**추측이 아니라 `git ls-files` 전수 대조로 매칭 수를 확인한 목록이다. 죽은 패턴 0개.**

```yaml
admin:
  # 관리자 화면·API 라우트  (src/app/(admin)/** 는 존재하지 않는 경로다 — 표기를 실경로로 교정)
  - 'src/app/admin/**'              # 48
  - 'src/app/api/admin/**'          #  6
  # 화면 본체
  - 'src/components/admin/**'       # 41
  # 데이터·변이 계층
  - 'src/lib/queries/admin/**'      # 20
  - 'src/lib/queries/admin*.ts'     #  1
  - 'src/lib/actions/admin/**'      # 11
  - 'src/lib/actions/admin*.ts'     #  2
  # 접근 제어 — /admin 진입은 미들웨어가 admin-token 으로 막는다
  - 'src/lib/admin-auth.ts'         #  1
  - 'src/middleware.ts'             #  1
  # E2E 하네스 자신 — spec·fixture·project 정의가 바뀌면 당연히 다시 돌아야 한다
  - 'e2e/qa/0[6-9]-*.spec.ts'       #  4
  - 'e2e/qa/1[0-4]-*.spec.ts'       #  6
  - 'e2e/fixtures/auth.setup.ts'    #  1
  - 'playwright.config.ts'          #  1
```

커버리지 **48 → 143 파일**. 현재 잡히는 48개는 **전부 포함**한다(축소 없음).

### 이 목록에 넣지 않은 것과 이유

- `src/lib/prisma.ts`·`src/lib/utils.ts`·`src/components/ui/**` 등 **공용 의존**:
  transitive closure 를 다 넣으면 사실상 `src/**` 가 되어 필터가 의미를 잃는다.
  이들은 `frontend` 필터가 이미 `quality` 를 트리거한다.
- `e2e/qa/14-error-edge-cases.spec.ts` 는 `qa-admin` 과 `qa-edge` **양쪽**에 잡힌다
  (`1[0-4]` 범위). 의도된 중복이므로 그대로 둔다.
- `src/app/api/admin/**` 6개 중 일부는 어드민 화면이 직접 호출하지 않을 수 있다.
  과포함 비용은 job 한 번 더 도는 것뿐이고, 누락 비용은 무검증 통과다 — 넓게 잡는다.

## 이번에 E2E Admin 이 돌지 않은 이유는 **두 가지이고 서로 독립이다**

| # | 이유 | 이번 PR 에서 손대나 |
|---|---|---|
| ① | `admin` 필터가 어드민 표면 대부분을 포함하지 않는다 | ❌ workflow 변경 = 승인 대상 |
| ② | `vars.E2E_ADMIN_ENABLED != 'true'` | ❌ **이건 결함이 아니라 안전 계약이다** |

②는 고칠 대상이 아니다. 어드민 E2E 는 저장·삭제·회원 제재를 실제로 실행하므로
**격리 staging + 전용 계정에서만** 켜야 한다. `src/__tests__/e2e-admin-guard.test.ts` 가 그 계약을 지키고,
job 안의 `Guard — staging 전용 대상·자격 확인` 스텝이 production 도메인을 거부한다.

따라서 ①만 고쳐도 ②가 꺼져 있는 한 E2E Admin 은 여전히 skip 된다.
①은 "지금 당장 테스트가 늘어나는 변경" 이 아니라 **②가 켜지는 날을 위한 선행 조건**이다.

## 하지 말 것

- `vars.E2E_ADMIN_ENABLED` 를 격리 staging 확인 없이 켜지 말 것.
- 이 항목을 기능 PR 에 섞어 넣지 말 것 — workflow 변경은 별도 승인 경로다.
- 필터만 넓히고 "E2E Admin 이 이제 돈다" 고 보고하지 말 것 (②가 꺼져 있으면 여전히 skip).
- `src/app/(admin)/**` 를 **지우지 않고 그대로 둔 채** 항목만 추가하지 말 것 —
  거짓 표기가 남아 다음 사람이 또 route group 이 있다고 오해한다.
- 넓힌 `admin` 이 `quality` job 도 트리거한다는 점을 잊지 말 것(위 표).

## 그동안의 대체 검증 (PR #486 에서 실제로 한 것)

server action 을 mock 한 렌더 동작 테스트로 배선을 고정했다. DB 를 건드리지 않는다.

- `src/__tests__/admin-screen-behavior.test.tsx` — MemberTable (검색·필터·페이지 이동·등급/제재·확인창)
- `src/__tests__/admin-mutation-contract.test.tsx` — AdBannerTable · BannerManager · ContentTable
  (등록/수정 payload 유지, 삭제 확인 취소·승인, 활성 전환 인자, 필터·검색 라우팅,
   일괄 액션 인자, 게시판/카테고리 저장·취소, 저장 중 중복 제출 차단)

이건 E2E 의 **대체**이지 동치가 아니다. 실제 DB 왕복·권한·미들웨어는 여전히 덮이지 않는다.

## 다음 액션

창업자 승인 후 workflow 전용 PR 로 분리해 ① 만 적용한다. ②는 격리 staging 확보가 선행 조건이다.
