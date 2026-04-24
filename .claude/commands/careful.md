# /careful — 되돌리기 어려운 작업 전 확인 게이트

## 트리거 조건 (자동 감지 — 이 작업 시작 전 항상 먼저)
- DB 마이그레이션: `prisma migrate deploy`, `prisma db push`, `prisma migrate dev`
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
> "예: prisma migrate deploy — trendingScore 컬럼 추가"

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

## DB 마이그레이션 특별 절차

DB 마이그레이션은 `/prisma-guide` 스킬 참조.
기본 절차:

```bash
# 1. 현재 마이그레이션 상태 확인
npx prisma migrate status

# 2. 변경 내용 미리보기 (실제 적용 전)
npx prisma migrate dev --create-only --name [migration-name]

# 3. 생성된 SQL 파일 확인
cat prisma/migrations/*/migration.sql

# 4. 사용자 확인 후 실제 적용
npx prisma migrate deploy
```

**Supabase 주의**: 트랜잭션 안 되는 마이그레이션(Enum 추가 등)은 SQL Editor에서 직접 실행 필요.
상세: `.claude/commands/prisma-guide/references/enum-migration.md`

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
