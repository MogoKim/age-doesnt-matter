# 후속 workflow 항목 — E2E Admin path filter 가 `src/components/admin/**` 을 못 본다

- 상태: **Backlog (이번 PR 에서 고치지 않는다)**
- 발견: 2026-09-16, Admin Console Foundation 2.1 (PR #486) 검증 중
- 분류: CI workflow 변경 → `.claude/rules/autonomy.md` §2-B **AUTO 금지** 영역. 창업자 승인 필요.

## 실측 (2026-09-16, `.github/workflows/ci.yml`)

```yaml
# detect-changes → dorny/paths-filter@v3
admin:
  - 'src/app/(admin)/**'
```

```yaml
e2e-admin:
  if: needs.detect-changes.outputs.admin == 'true' && vars.E2E_ADMIN_ENABLED == 'true'
```

## 문제 정의

어드민 **화면 컴포넌트의 본체**는 `src/components/admin/**` 에 있다
(`AdBannerTable` · `BannerManager` · `ContentTable` · `MemberTable` · `PopupManager` 등).
`src/app/(admin)/**` 는 이들을 불러 배치하는 얇은 page 층이다.

즉 **어드민 동작을 실제로 바꾸는 변경이 `admin` 필터에 걸리지 않는다.**
PR #486 이 그 예다 — 어드민 5개 화면 중 4개를 건드렸는데 `admin` 필터는 `false` 였다.

### 이번에 E2E Admin 이 돌지 않은 이유는 **두 가지이고, 서로 독립이다**

| # | 이유 | 이번 PR 에서 손대나 |
|---|---|---|
| ① | `admin` 필터가 `src/components/admin/**` 을 포함하지 않는다 | ❌ workflow 변경 = 승인 대상 |
| ② | `vars.E2E_ADMIN_ENABLED != 'true'` | ❌ **이건 결함이 아니라 안전 계약이다** |

②는 고칠 대상이 아니다. 어드민 E2E 는 저장·삭제·회원 제재를 실제로 실행하므로
**격리 staging DB + 전용 계정에서만** 켜야 한다. `e2e-admin-guard.test.ts` 가 그 계약을 지킨다.
production write 가능성이 확인되지 않은 환경에서 켜면 안 된다.

따라서 ①만 고쳐도 ②가 꺼져 있는 한 E2E Admin 은 여전히 skip 된다.
①은 "지금 당장 테스트가 늘어나는 변경" 이 아니라 **②가 켜지는 날을 위한 선행 조건**이다.

## TO-BE (제안 — 승인 후 실행)

```yaml
admin:
  - 'src/app/(admin)/**'
  - 'src/components/admin/**'
  - 'src/lib/actions/admin*.ts'
```

## 하지 말 것

- `vars.E2E_ADMIN_ENABLED` 를 격리 staging 확인 없이 켜지 말 것.
- 이 항목을 기능 PR 에 섞어 넣지 말 것 — workflow 변경은 별도 승인 경로다.
- 필터만 넓히고 "E2E Admin 이 이제 돈다" 고 보고하지 말 것 (②가 꺼져 있으면 여전히 skip).

## 그동안의 대체 검증 (PR #486 에서 실제로 한 것)

server action 을 mock 한 렌더 동작 테스트로 배선을 고정했다. DB 를 건드리지 않는다.

- `src/__tests__/admin-screen-behavior.test.tsx` — MemberTable (검색·필터·페이지 이동·등급/제재·확인창)
- `src/__tests__/admin-mutation-contract.test.tsx` — AdBannerTable · BannerManager · ContentTable
  (등록/수정 payload 유지, 삭제 확인 취소·승인, 활성 전환 인자, 필터·검색 라우팅,
   일괄 액션 인자, 게시판/카테고리 저장·취소, 저장 중 중복 제출 차단)

이건 E2E 의 **대체**이지 동치가 아니다. 실제 DB 왕복·권한·미들웨어는 여전히 덮이지 않는다.

## 다음 액션

창업자 승인 후 workflow 전용 PR 로 분리해 ① 만 적용한다. ②는 격리 staging 확보가 선행 조건이다.
