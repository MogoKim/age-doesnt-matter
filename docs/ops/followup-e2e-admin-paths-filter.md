# E2E Admin path filter — 어드민 표면 전체를 보도록 확대 (구현 완료)

- 상태: **구현됨** — `admin` 필터 커버리지 **48 → 145파일**.
- 최초 발견: 2026-09-16, Admin Console Foundation 2.1 (PR #486) 검증 중 (그 PR 에서는 `ci.yml` 무변경)
- 구현: 별도 workflow 전용 PR. 계약은 `src/__tests__/ci-admin-paths-filter.test.ts` 가 고정한다.

## 🔴 `E2E_ADMIN_ENABLED` 와 혼동하지 말 것

이 확대는 **안전 게이트 해제가 아니다.** `vars.E2E_ADMIN_ENABLED` 가 꺼져 있으면
E2E Admin 은 **계속 skip** 이다. 두 조건은 AND 로 묶여 있고, 계약 테스트가 그걸 고정한다.

## ⚠️ 이 문서의 이전 판(2026-09-16 최초 작성)은 틀렸다 — 정정

최초 판은 AS-IS 를 "`admin` 필터가 `src/app/(admin)/**` 뿐이라 **관리자 page 를 포함해** 못 본다" 로 적었다.
그 뒤 dorny/paths-filter 와 **동일한 매처로 실측**한 결과 두 가지가 확인됐다.

1. **`src/app/(admin)` 이라는 디렉터리는 존재하지 않는다.** 실제 관리자 route 는 `src/app/admin/**` 이다.
2. **그럼에도 현재 필터는 관리자 page 를 놓치지 않는다.** `dorny/paths-filter@v3` 는
   `picomatch(pattern, { dot: true })` 를 쓰는데, picomatch 는 앞에 `?`·`!`·`+`·`*`·`@` 가 없는
   맨 `(admin)` 을 **캡처 그룹**으로 컴파일한다. 결과적으로 리터럴 `admin` 세그먼트에 매칭된다.

```
picomatch('src/app/(admin)/**', {dot:true})
  'src/app/admin/(panel)/page.tsx'         → true
  'src/app/admin/(panel)/content/page.tsx' → true
  'src/app/(admin)/admin/page.tsx'         → false   ← 표기대로의 경로는 오히려 안 잡힌다(존재하지도 않는다)
  'src/components/admin/ContentTable.tsx' → false
```

`git ls-files` 전수 대조: 현재 필터가 잡는 파일 **48개 = `src/app/admin/**` 전부**.

즉 **"관리자 page 를 놓친다" 는 틀렸다.** 실제 결함은 두 가지다.

- **표기가 거짓이다.** 존재하지 않는 Next.js route group 을 가리키는 것처럼 보이고,
  실제로는 picomatch 의 그룹 문법 부작용으로만 살아 있다. 매처가 바뀌거나 누군가
  "route group 이 없네" 하고 괄호를 `src/app/(admin)/` 실경로로 '고치면' **소리 없이 죽는다.**
- **page 층 말고는 전부 놓친다.** 어드민 화면의 본체(컴포넌트·쿼리·server action·API·미들웨어)와
  **E2E 하네스 자신**이 필터 밖이다.

## 교정 전 (실측)

```yaml
admin:
  - 'src/app/(admin)/**'     # 실측 48파일 = src/app/admin/** (우연히 매칭)
```

`admin` 출력을 소비하는 job 은 **둘**이다 — 넓히면 둘 다 영향을 받는다.

| job | 조건 | 확대 영향 |
|---|---|---|
| `quality` (Lint→Typecheck→Test→Build) | `frontend \|\| prisma \|\| admin` | 어드민 표면·`ci.yml` 단독 변경에도 실행 → **계약 테스트가 실제로 돈다** |
| `e2e-admin` | `admin == 'true' && vars.E2E_ADMIN_ENABLED == 'true'` | 감지 범위만 넓어짐. **게이트가 꺼져 있으면 여전히 skip** |

계약 테스트가 "`admin` 출력을 쓰는 job 은 이 둘뿐" 을 단언한다 — 영향 범위가 조용히 늘지 않는다.

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

## 구현 결과 (실측 — `git ls-files` 1,407파일 전수 대조)

```yaml
admin:
  # 관리자 화면·API 라우트
  - 'src/app/admin/**'                             # 48
  - 'src/app/api/admin/**'                         #  6
  # 화면 본체 — 실제 동작이 여기 있다
  - 'src/components/admin/**'                      # 41
  # 데이터·변이 계층
  - 'src/lib/queries/admin/**'                     # 20
  - 'src/lib/queries/admin*.ts'                    #  1
  - 'src/lib/actions/admin/**'                     # 11
  - 'src/lib/actions/admin*.ts'                    #  2
  # 접근 제어 — /admin 진입은 미들웨어가 admin-token 으로 막는다
  - 'src/lib/admin-auth.ts'                        #  1
  - 'src/middleware.ts'                            #  1
  # E2E 하네스 자신 — qa-admin project 가 쓰는 spec·fixture·설정
  - 'e2e/qa/0[6-9]-*.spec.ts'                      #  4
  - 'e2e/qa/1[0-4]-*.spec.ts'                      #  6
  - 'e2e/fixtures/auth.setup.ts'                   #  1
  - 'playwright.config.ts'                         #  1
  # 🔴 검사 도구 자신 (design 필터와 같은 이유)
  - '.github/workflows/ci.yml'                     #  1
  - 'src/__tests__/ci-admin-paths-filter.test.ts'  #  1
```

**커버리지 48 → 145파일.** 교정 전 48개는 **전부 포함**(축소 0) · **죽은 패턴 0개**.

최초 조사 시점의 제안은 143파일이었다. 실제 구현은 거기에 **검사 도구 자신 2개**
(`ci.yml`·계약 테스트)를 더한 145다. 이 둘이 없으면 **필터나 계약만 고친 PR 에서
`quality` 가 돌지 않아 계약 테스트가 한 번도 실행되지 않는다** — `design` 필터가
audit 스크립트·baseline 을 스스로 담는 것과 같은 이유다.

### 🔴 판정에 실제 matcher 를 쓴다

계약 테스트는 `dorny/paths-filter@v3` 와 **같은 라이브러리·같은 옵션**으로 판정한다 —
`picomatch@^2.3.1`, `{ dot: true }` (dorny/paths-filter 저장소의 `src/filter.ts` 에 있는 `MatchOptions`).

기존 `ci-paths-filter.test.ts` 는 `dir/**` 와 단일 파일만 처리하는 손수 만든 matcher 를
썼다. 새 필터의 `admin*.ts`·`0[6-9]-*.spec.ts` 를 그 matcher 에 물리면 **전부 false**
가 나와 false-green 이 된다. 그래서 그 파일의 matcher 도 picomatch 로 교체했고,
`picomatch` 를 devDependency 로 **명시 선언**했다(전에는 transitive 로만 존재).

### 이 목록에 넣지 않은 것과 이유

- `src/lib/prisma.ts`·`src/lib/utils.ts`·`src/components/ui/**` 등 **공용 의존**:
  transitive closure 를 다 넣으면 사실상 `src/**` 가 되어 필터가 의미를 잃는다.
  이들은 `frontend` 필터가 이미 `quality` 를 트리거한다.
- `e2e/qa/14-error-edge-cases.spec.ts` 는 `qa-admin` 과 `qa-edge` **양쪽**에 잡힌다
  (`1[0-4]` 범위). 의도된 중복이므로 그대로 둔다.
- `src/app/api/admin/**` 6개 중 일부는 어드민 화면이 직접 호출하지 않을 수 있다.
  과포함 비용은 job 한 번 더 도는 것뿐이고, 누락 비용은 무검증 통과다 — 넓게 잡는다.

## E2E Admin 이 돌지 않는 이유는 **두 가지이고 서로 독립이다**

| # | 이유 | 지금 상태 |
|---|---|---|
| ① | `admin` 필터가 어드민 표면 대부분을 포함하지 않았다 | ✅ **이 PR 에서 해소** (48 → 145) |
| ② | `vars.E2E_ADMIN_ENABLED != 'true'` | ⏸ **그대로 둔다 — 결함이 아니라 안전 계약이다** |

②는 고칠 대상이 아니다. 어드민 E2E 는 저장·삭제·회원 제재를 실제로 실행하므로
**격리 staging + 전용 계정에서만** 켜야 한다. `src/__tests__/e2e-admin-guard.test.ts` 가 그 계약을 지키고,
job 안의 `Guard — staging 전용 대상·자격 확인` 스텝이 production 도메인을 거부한다.

🔴 **①을 고쳤어도 ②가 꺼져 있는 한 E2E Admin 은 여전히 skip 된다.**
①은 "지금 당장 테스트가 늘어나는 변경" 이 아니라 **②가 켜지는 날을 위한 선행 조건**이다.
계약 테스트가 이 AND 관계를 단언한다 — 누가 `&&` 를 `||` 로 바꾸면 실패한다.

## 하지 말 것

- `vars.E2E_ADMIN_ENABLED` 를 격리 staging 확인 없이 켜지 말 것.
- 이 확대를 근거로 "E2E Admin 이 이제 돈다" 고 보고하지 말 것 (②가 꺼져 있으면 여전히 skip).
- `src/app/(admin)/**` 를 되살리지 말 것 — 존재하지 않는 경로이고, picomatch 의
  캡처 그룹 부작용으로만 매칭되던 표기다.
- 계약 테스트의 matcher 를 직접 구현한 것으로 되돌리지 말 것 —
  `admin*.ts`·`0[6-9]-*.spec.ts` 가 전부 false 가 되어 **false-green** 이 된다.
- 넓힌 `admin` 이 `quality` job 도 트리거한다는 점을 잊지 말 것(위 표).

## 대체 검증 (PR #486 에서 한 것 — ②가 꺼져 있는 동안 유효)

server action 을 mock 한 렌더 동작 테스트로 배선을 고정했다. DB 를 건드리지 않는다.

- `src/__tests__/admin-screen-behavior.test.tsx` — MemberTable (검색·필터·페이지 이동·등급/제재·확인창)
- `src/__tests__/admin-mutation-contract.test.tsx` — AdBannerTable · BannerManager · ContentTable
  (등록/수정 payload 유지, 삭제 확인 취소·승인, 활성 전환 인자, 필터·검색 라우팅,
   일괄 액션 인자, 게시판/카테고리 저장·취소, 저장 중 중복 제출 차단)

이건 E2E 의 **대체**이지 동치가 아니다. 실제 DB 왕복·권한·미들웨어는 여전히 덮이지 않는다.

## 다음 액션

①은 끝났다. 남은 것은 ②뿐이고, 그 선행 조건은 **격리 staging DB + 전용 어드민 계정 확보**다
(`vars.E2E_ADMIN_BASE_URL` + `secrets.E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).
그게 갖춰지기 전에는 `E2E_ADMIN_ENABLED` 를 켜지 않는다 — production write 위험을 막는 계약이다.
