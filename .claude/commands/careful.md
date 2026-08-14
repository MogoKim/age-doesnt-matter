# /careful — 되돌리기 어려운 작업 전 확인 게이트

## 트리거 조건 (자동 감지 — 이 작업 시작 전 항상 먼저)
- DB 스키마 변경: `prisma/schema.prisma` 수정, 운영 DB에 DDL 실행 (절차는 `/prisma-guide` — Prisma CLI 마이그레이션은 **이 프로젝트 미사용**)
- Git 위험 작업: `git push --force`, `git reset --hard`, `git checkout .`, `git clean -f`
- 에이전트 구조 변경: `runner.ts` HANDLERS 수정, 워크플로우 case문 수정/삭제
- 환경변수 변경: GitHub Secrets 추가/삭제, `.env` 키 제거
- 패키지 변경: `npm uninstall`, 패키지 다운그레이드
- 파일 삭제: `rm -rf`, 대량 파일 삭제
- 수동 트리거: "조심히", "careful", "위험한 작업"

---

## 확인 흐름 (생략 불가)

### 1. 작업 요약
작업 내용을 1줄로 명시:
> "예: pg 모듈로 `Post.trendingScore` 컬럼 추가 (ADD COLUMN IF NOT EXISTS) — `/prisma-guide` 절차"

### 2. 되돌리기 가능 여부
| 기호 | 의미 |
|------|------|
| ✅ 가능 | 되돌릴 수 있음 (git revert, down migration 등) |
| ⚠️ 어려움 | 되돌릴 수 있지만 복잡한 절차 필요 |
| ❌ 불가 | 되돌릴 수 없음 (데이터 삭제, force push 등) |

### 3. 영향 범위
- 에이전트/크론 영향: 없음 / [있으면 구체적으로]
- 사이트 기능 영향: 없음 / [있으면 구체적으로]
- 어드민 패널 영향: 없음 / [있으면 구체적으로]
- 데이터 영향: 없음 / [있으면 구체적으로]

### 4. 대안 확인
더 안전한 방법이 있는가? 있으면 제안.

### 5. AskUserQuestion: "진행할까요?"

---

## DB 스키마 변경 특별 절차

**정본은 `/prisma-guide`다.** 절차·검증·금지 명령 전부 그쪽을 따른다.

### ⛔ Prisma CLI 마이그레이션은 이 프로젝트에서 사용하지 않는다

아래는 **일반적인 Prisma 절차이지만 우리는 쓰지 않는다.** 왜 금지인지 남겨 두니, 다른 프로젝트 경험으로 실수하지 마라.

```bash
# ⛔ 사용 금지 — 참고용으로만 남김
npx prisma migrate status                              # pooler에서 타임아웃 이력(3분)
npx prisma migrate dev --create-only --name [name]     # 금지
npx prisma migrate deploy                              # 금지 — 아래 이유
npx prisma db push / db seed / migrate resolve         # 금지
```

**금지 이유 2가지**
1. **Supabase pooler(6543) 비호환** — Prisma CLI 마이그레이션이 정상 동작하지 않는다.
2. **`_prisma_migrations`가 실제 스키마와 다르다** — CLI를 쓰지 않으므로 이력이 채워지지 않았고, 이 상태에서 `migrate deploy`를 실행하면 이미 존재하는 객체 때문에 **실패하고 failed 행이 남아 이후 deploy가 영구 차단**된다(2026-08-14 진단).

### ✅ 실제 절차
`prisma/schema.prisma` 수정 → **pg 모듈로 직접 SQL 실행**(멱등적으로) → `npx prisma generate` → `information_schema` 조회로 검증 → `npx tsc --noEmit`.
상세: `.claude/commands/prisma-guide/prisma-guide.md` · enum은 `references/enum-migration.md`

---

## Git 위험 작업 특별 절차

```bash
# force push 전: 현재 원격 상태 확인
git log origin/main --oneline -5
git log HEAD --oneline -5

# reset --hard 전: stash로 백업
git stash push -m "careful-backup-$(date +%Y%m%d-%H%M%S)"
```

---

## 출력 형식

```
## /careful 확인 게이트

작업: [1줄 요약]
되돌리기: ✅/⚠️/❌ [이유]

영향 범위:
- 에이전트/크론: [없음/있음]
- 사이트 기능: [없음/있음]
- 어드민: [없음/있음]
- 데이터: [없음/있음]

대안: 없음 / [있으면 제안]

진행할까요? (Y/N)
```
