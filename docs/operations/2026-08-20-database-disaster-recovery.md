# DB 재해 복구 절차 (Database Disaster Recovery)

> **작성 2026-08-20 · 근거: P0-3A 감사**
> 대상: 우나어 운영 DB · M3 새 브랜드 빈 DB
> 관련: `.claude/commands/prisma-guide/` · `docs/operations/m3-new-brand-readiness.md` §14-5~14-8 · §19 P0-3

---

## 0. 한 줄 판정

> **🔴 운영 DB에서 `seed.ts`를 실행하지 않는다.**
> **🔴 복구는 시나리오별로 다르며, 운영 DB 절차와 빈 DB 절차를 절대 섞지 않는다.**

빈 DB에서 안전한 명령이 운영 DB에서는 파괴적이다. **어느 DB를 보고 있는지 확인하지 않은 채 어떤 명령도 실행하지 않는다.**

> 🔴 **그리고 PITR이 없다.** daily backup(자정 무렵)만 있어 "사고 직전"으로 되돌릴 수 없다.
> 사고가 나면 **마지막 백업 이후의 실회원 데이터는 유실된다**(최대 24시간치). 상세 §8-1·§8-2.

---

## 1. 복구 전 공통 확인 (예외 없음)

### 1-1. 🔴 지금 보고 있는 DB가 무엇인지부터 확인한다

```sql
-- 이 한 줄로 운영 DB인지 빈 DB인지 갈린다
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

| 결과 | 판정 | 갈 곳 |
|---|---|---|
| **0** | 빈 DB | S2 · S8 |
| **46** | 정상 운영 DB | S1 · S4 · S5 · S6 |
| **1~45** | 🔴 **중간 실패 상태** | S3 — 재실행 금지 |
| 47 이상 | ⚠️ 예상 밖. 중단하고 원인 규명 | — |

### 1-2. 상태 확인 3종

```sql
-- 게시판 설정 (비어 있으면 전 게시판 404)
SELECT "boardType","displayName","isActive",array_length("categories",1)
FROM "BoardConfig" ORDER BY "boardType";

-- 관리자 계정 (0이면 어드민 접근 불가)
SELECT count(*) FROM "AdminAccount";

-- enum · FK 정합
SELECT count(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid
WHERE n.nspname='public' AND t.typtype='e';                                   -- 36
SELECT count(*) FROM information_schema.table_constraints
WHERE table_schema='public' AND constraint_type='FOREIGN KEY';                -- 34
```

### 1-3. 🔴 연결 포트 — `DIRECT_URL`(5432)을 쓴다

```
DATABASE_URL   Supabase transaction pooler · 포트 6543
               트랜잭션 모드라 장기 세션을 유지할 수 없다
               → DDL 실행 시 P1017 "Server has closed the connection"

DIRECT_URL     direct connection · 포트 5432
               → 🔴 스키마 작업·DDL·복구는 반드시 이쪽

실측 (2026-08-20)
  prisma/seed.ts:5          DIRECT_URL ?? DATABASE_URL   ✅
  scripts/create-admin.ts:11 DIRECT_URL ?? DATABASE_URL   ✅
  agents/core/db.ts          DATABASE_URL ?? DIRECT_URL   (런타임용 — 정상)
  src/lib/prisma.ts          production=DATABASE_URL / dev=DIRECT_URL (정상)

⚠️ `references/pooler-issues.md`의 예시 코드가 `DATABASE_URL`을 쓴다.
   원인 설명은 pooler(6543)가 문제라면서 예시는 그 포트를 쓴다 — 문서 오류로 보인다.
   복구 시에는 예시를 그대로 복사하지 말고 DIRECT_URL로 바꿔 쓴다.
```

---

## 2. 시나리오별 복구 절차

### S1 — 운영 DB 정상, read-only 점검만 필요

```
목적    이상 유무 확인. 아무것도 바꾸지 않는다
전제    §1-1 결과 = 46
```

§1-2의 쿼리 3종을 실행하고 기대값과 대조한다. **금지 명령 없음 — 전부 안전하다.**

```
기대값   테이블 46 · enum 36 · FK 34 · BoardConfig 7행 · AdminAccount ≥ 1
```

---

### S2 — 빈 Supabase project 초기화

```
전제    §1-1 결과 = 0   🔴 0이 아니면 이 절차를 쓰지 않는다
```

```bash
# 1. DDL 생성 — DB에 접속하지 않는다
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /tmp/init.sql

# 2. 생성물 확인
grep -c 'CREATE TABLE' /tmp/init.sql    # 46
grep -c 'CREATE TYPE'  /tmp/init.sql    # 36
```

```
3. Node.js pg 모듈로 실행 — DIRECT_URL(5432)
   패턴: .claude/commands/prisma-guide/references/pooler-issues.md
   ⚠️ 예시의 DATABASE_URL을 DIRECT_URL로 바꿔 쓴다

4. 검증 — §1-2 (46 / 36 / 34)
5. npx prisma generate
6. npx tsc --noEmit
```

🚫 **금지**: `migrate deploy` · `db push` · pooler(6543) 사용 · `seed.ts` 실행

---

### S3 — DDL 실행 실패 후 복구

```
증상    §1-1 결과가 1~45 (중간 실패 상태)
```

> **🔴 같은 SQL을 재실행하지 않는다.**
> `migrate diff` 출력에는 멱등 구문이 **0건**이다(실측: `CREATE TABLE IF NOT EXISTS` 0 / `CREATE TYPE IF NOT EXISTS` 0 / `DO $$` 0 / 트랜잭션 0).
> 재실행하면 첫 `CREATE TYPE "Role"`에서 `42710 duplicate_object`로 즉시 실패하고, 일부 테이블만 생성된 상태가 그대로 남는다.

| 방식 | 절차 | 권장 |
|---|---|---|
| **A** | 새 Supabase project를 만들고 S2를 처음부터 | 🟢 **가장 안전** — 데이터가 없으므로 재생성 비용이 가장 낮다 |
| **B** | `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` 후 S2 | 🟡 빠르지만 되돌릴 수 없다. **빈 DB에만** |

🚫 **운영 DB에는 B를 절대 쓰지 않는다.**

---

### S4 — BoardConfig가 비어 게시판이 죽은 경우

```
증상    /community/* 전부 404 · 글쓰기 "현재 글을 작성할 수 없는 게시판입니다"
원인    src/lib/queries/boards.ts:28-31
          const config = await prisma.boardConfig.findUnique({ where: { boardType } })
          if (!config || !config.isActive) return null      ← fallback 없음
        src/lib/actions/posts.ts:78
          if (!boardConfig?.isActive) return { error: '현재 글을 작성할 수 없는 게시판입니다' }
```

> **🚫 `seed.ts`를 실행해 복구하지 않는다.** 이유는 §3 참조.

```
✅ 복구 방법
   A(권장)  어드민 화면에서 해당 게시판 설정 복구
            ⚠️ AdminAccount가 필요하다. 없으면 S5 먼저
   B        해당 boardType 1행만 upsert하는 임시 스크립트
            · DIRECT_URL 사용
            · where: { boardType }  ← 해당 보드만
            · 🚫 다른 보드를 건드리지 않는다
```

---

### S5 — AdminAccount가 없어 어드민 접근 불가

```bash
npx tsx scripts/create-admin.ts <이메일> <닉네임> <비밀번호>
```

```
모델    AdminAccount { email @unique · passwordHash · nickname · role }
해시    bcrypt (bcryptjs) · saltRounds = 12
        생성 create-admin.ts:34   bcrypt.hash(password, 12)
        검증 admin-auth.ts:35     bcrypt.compare(...)
전제    .env.local 에 DIRECT_URL 설정
제약    비밀번호 8자 이상 · 중복 이메일 거부(멱등 아님)
검증    /admin/login 로그인 성공

🔴 비밀번호를 대화·로그·커밋 메시지에 남기지 않는다. 창업자가 직접 입력한다.
```

---

### S6 — migration 이력과 schema가 어긋난 경우

> **🟢 이것은 고장이 아니다. 이 프로젝트의 정상 상태다.**

```
실측 (2026-08-20)
  prisma/schema.prisma        모델 46
  prisma/migrations/          디렉터리 52 · 누적 CREATE TABLE 39
  이력에 없는 9모델
    AdminQueue · DailyBrief · HomeCurationOverride · Notice · Popup
    PushSubscription · SocialPost · VoteBallot · VoteEvent

근거
  prisma-guide.md:13  "CLI를 쓰지 않으므로 _prisma_migrations 이력은 채워지지 않는다.
                       불일치는 결함이 아니라 이 운영 방식의 당연한 결과다."
  prisma-guide.md:17  "prisma/migrations/*.sql 파일은 스키마 변경 이력의 기록물로만 쓴다."
```

```
✅ 조치    아무것도 하지 않는다
🚫 금지    migrate resolve · migrate deploy
           → prisma-guide.md:16 — 첫 건부터 "이미 존재" 오류로 실패하고
             _prisma_migrations에 failed 행이 남아 **이후 모든 deploy가 영구 차단**된다

⚠️ 의미    migration 파일만으로는 현재 스키마를 재현할 수 없다.
           복구는 반드시 `migrate diff --from-empty` 기반이어야 한다(S2).
```

정리는 S9로 분리한다.

---

### S7 — 🔴 `seed.ts`를 운영 DB에 실행할 뻔했거나 실행한 경우

#### 실행 전이라면 — 즉시 중단

§3의 위험 3종을 확인하고, S4(BoardConfig) 또는 개별 스크립트로 우회한다.

#### 이미 실행했다면 — 피해 범위 확인

```sql
-- ① seed_ 계정의 글이 삭제됐는지
SELECT count(*) FROM "Post" WHERE "authorId" IN
  (SELECT id FROM "User" WHERE "providerId" LIKE 'seed_%');

-- ② BoardConfig가 seed 값으로 덮였는지
SELECT "boardType","displayName","description","categories"
FROM "BoardConfig" ORDER BY "boardType";

-- ③ 샘플 글·댓글이 새로 생겼는지
SELECT count(*) FROM "Post"  WHERE "createdAt" > '<실행 시각>';
SELECT count(*) FROM "Comment" WHERE "createdAt" > '<실행 시각>';
```

#### 🔴 복구 — PITR이 없다. 정밀 복구는 불가하다

> **확인됨(2026-08-20): PITR 비활성 · daily backup만 존재(§8-1).**
> **"사고 5분 전"으로 되돌릴 수 없다.** 마지막 자정 스냅샷이 기준선이다.

```
① 삭제된 글·댓글
   기본 경로   마지막 daily backup (자정 무렵) 기준 복구
   🔴 손실     마지막 백업 이후 ~ 사고 시각 사이의 실회원 글·댓글·가입은 유실된다
               사고가 자정 직후면 최대 24시간치다

   권장 절차
     1. 사고 시각과 마지막 백업 시각의 간격을 먼저 계산한다
     2. 🟢 "Restore to new project (BETA)"로 **새 project에 복원**한다
        → 운영 DB를 덮지 않는다. 비교·부분 추출이 가능하다
     3. 두 DB를 비교해 삭제된 행만 식별한다
        (seed.ts 삭제 범위: providerId LIKE 'seed_%')
     4. 필요한 행만 운영 DB에 개별 INSERT
     🚫 운영 DB에 직접 Restore를 누르지 않는다 — 백업 이후 데이터가 함께 사라진다

② BoardConfig
   → 어드민에서 재설정. 덮어쓰기이므로 원래 값을 알아야 한다
   → 원래 값을 모르면 ①의 새 project 복원본에서 조회한다

③ 샘플 데이터
   → providerId LIKE 'seed_%' 기준으로 식별해 개별 처리
   🚫 deleteMany를 쓰지 않는다. 같은 사고를 반복한다

⚠️ 이미지·첨부 파일은 이 경로로 복구되지 않는다. DB 백업에 Storage 객체가 없다(§8-3).
```

**🛑 창업자 승인 없이 Restore 버튼을 누르지 않는다.** 되돌릴 수 없는 작업이다.

---

### S8 — M3 D-day 새 DB 초기화

```
1. 새 Supabase project 생성 (창업자)
2. S2 전 과정
3. BoardConfig 3행 seed — 🔴 별도 스크립트
   scripts/seed-m3-minimal-board-config.ts (D-day에 작성)
   MENOPAUSE · STORY · MAGAZINE 만. upsert
   🚫 기존 prisma/seed.ts 실행 금지
4. S5 (AdminAccount 생성)
5. 검증: BoardConfig 3행 · /community/* 200 · /jobs 404

상세: docs/operations/m3-new-brand-readiness.md §14-2 · §14-4 · §14-8
```

---

### S9 — 우나어 생존 후 migration 이력 정리

```
🚫 네이버 생존 판정 전 착수 금지
   근거: m3-new-brand-readiness.md §19-8
   수집이 10건/day라 무엇을 바꿔도 검증이 안 되고, 변수를 늘리면 원인 규명이 불가능해진다

판정 후 절차 (고위험 · 별도 승인 필요)
  1. 9모델의 DDL을 멱등 SQL로 작성 (prisma-guide.md:19-36 패턴)
  2. prisma/migrations/ 에 **기록물로만** 추가
  3. 🚫 CLI로 적용하지 않는다 — DB는 이미 그 스키마를 갖고 있다
  4. migrate diff 로 46/46 일치 확인

⚠️ 이 작업은 DB를 바꾸지 않는다. 이력 파일만 보강하는 것이다.
```

---

## 3. 🔴 `seed.ts` 위험 경고 (실측)

> **`prisma/seed.ts`는 초기 개발용이다. 재해 복구용이 아니다.**

### 위험 ① — 파괴적 연산 3건

```
prisma/seed.ts:135  prisma.comment.deleteMany({ where: { post: { author: { providerId: { startsWith: 'seed_' } } } } })
prisma/seed.ts:136  prisma.jobDetail.deleteMany({ where: { post: { author: { providerId: { startsWith: 'seed_' } } } } })
prisma/seed.ts:137  prisma.post.deleteMany({ where: { author: { providerId: { startsWith: 'seed_' } } } })
```

```
삭제 범위   providerId LIKE 'seed_%' 인 계정의 글 · 댓글 · jobDetail
영향        운영 DB에 seed_ 계정 데이터가 있으면 삭제된다
⚠️ 운영 DB에 seed_ 계정이 실제로 있는지는 미확인이다 (§5)
```

### 위험 ② — `BoardConfig.upsert`가 전량 덮어쓴다

```ts
// prisma/seed.ts:61-65
await prisma.boardConfig.upsert({
  where:  { boardType: config.boardType },
  update: config,          // 🔴 displayName · description · categories 전부 덮어씀
  create: config,
})
```

**운영 중 어드민에서 카테고리나 표시명을 수정했다면 seed 실행 시 전부 원복된다.**

### 위험 ③ — 샘플 데이터 생성

```
create 9건   user.upsert · post.create · jobDetail.create · comment.create ×6
             (삭제된 댓글 케이스 포함)
→ 실제 회원 목록과 고객 화면에 테스트 데이터가 섞인다
```

### 결론

```
🚫 운영 DB 복구에 seed.ts를 사용하지 않는다
🚫 M3 D-day에도 사용하지 않는다 (§14-3)
✅ 필요한 것은 BoardConfig 1~3행뿐이다 → 개별 upsert 스크립트를 쓴다
```

---

## 4. DDL 생성 절차

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > init.sql
```

```
⚠️ --to-schema-datamodel 은 Prisma 7에서 제거됐다. --to-schema 가 맞다
✅ 이 명령은 DB에 접속하지 않는다 (--from-empty)
✅ prisma.config.ts 가 datasource URL을 공급한다 (schema.prisma에는 url이 없다)

실측 산출물 (2026-08-20)
  1,503줄 / 49,096 bytes
  CREATE TABLE 46  ← schema 46모델과 정확히 일치 (46/46)
  CREATE TYPE  36 · CREATE INDEX 99 · UNIQUE INDEX 36 · FK 34 · PK 46
  ✅ migrations에 없던 9모델도 전부 포함
  ✅ Supabase 전용 의존 0건 (CREATE EXTENSION · auth. · storage. · SECURITY DEFINER)
     → 순수 PostgreSQL. 어떤 Postgres에도 이식 가능하다
```

### 🔴 DDL은 1회 전용이다

```
멱등 구문 0건 (실측)
  CREATE TABLE IF NOT EXISTS   0 / 46
  CREATE TYPE  IF NOT EXISTS   0 / 36
  CREATE INDEX IF NOT EXISTS   0 / 99
  DO $$ 블록                    0
  BEGIN / COMMIT 트랜잭션        0

→ 재실행 시 첫 CREATE TYPE "Role" 에서 42710 즉시 실패
→ 트랜잭션이 없으므로 중간 실패 시 일부 테이블만 남는다
⚠️ prisma-guide.md:7("신규 SQL은 멱등적으로 작성")과 충돌한다.
   migrate diff 출력은 프로젝트 원칙을 따르지 않는다

🚫 실패 시 같은 DB에 재실행 금지 → S3
✅ 권장 복구: 새 Supabase project 재생성
```

### 재실행 금지 조건

```
1. 실행 전 테이블 수 != 0
2. _prisma_migrations 테이블이 이미 존재
3. 이전 실행이 중간 실패 → DROP SCHEMA 또는 project 재생성 없이 재시도 금지
4. 기존 데이터가 1행이라도 있는 DB
```

---

## 5. 🚫 절대 금지 명령

### 운영 DB 대상 — 예외 없음

```
prisma migrate deploy       pooler 비호환 + "이미 존재" 오류 + 영구 차단
prisma migrate dev          shadow DB 생성 · 스키마 임의 변경
prisma migrate reset        🔴 데이터 전량 삭제
prisma migrate resolve      _prisma_migrations 이력 조작
prisma db push              migration 이력 없이 스키마 강제 반영
prisma db seed              prisma-guide.md:5 명시 금지
npx tsx prisma/seed.ts      🔴 deleteMany 3건 + BoardConfig 전량 덮어쓰기 (§3)
DROP SCHEMA / DROP TABLE / TRUNCATE
실패한 DDL 재실행           멱등성 0건 (§4)
pooler(6543)로 DDL 실행     P1017 연결 종료
```

### 조건부 허용

```
🟡 pg 모듈 직접 SQL          prisma-guide.md:6 이 인정한 유일한 경로
                            조건: 멱등 작성 + DIRECT_URL(5432) + information_schema 검증
🟡 DROP SCHEMA public CASCADE  빈 DB에만. 운영 DB 절대 금지
```

---

## 6. raw SQL 금지 원칙의 층위 구분

혼동하기 쉬운 지점이라 명시한다. **두 규칙은 충돌하지 않는다. 층위가 다르다.**

| 층위 | 규칙 | 출처 |
|---|---|---|
| **애플리케이션 코드** | 🔴 **Raw SQL 절대 금지** — Prisma Client만 사용 | `CLAUDE.md` |
| **스키마 변경 · 재해 복구** | ✅ **pg 모듈 직접 SQL이 유일한 경로** | `prisma-guide.md:6` |

```
왜 예외가 필요한가
  Supabase pooler(6543)가 Prisma CLI 마이그레이션의 장기 세션을 지원하지 않는다.
  → CLI를 못 쓰므로 스키마 변경은 pg로 직접 실행할 수밖에 없다.

예외의 조건 (셋 다 충족해야 한다)
  1. DIRECT_URL(5432) 사용
  2. 멱등 SQL 작성 (prisma-guide.md:19-36) — 단 migrate diff 산출물은 예외(1회 전용)
  3. information_schema 로 반영 검증 + 문서화
```

---

## 7. 체크리스트

### 실행 전

```
[ ] §1-1 — 대상 DB의 테이블 수를 확인했다 (0 / 46 / 중간)
[ ] 시나리오를 특정했다 (S1~S9 중 하나)
[ ] DIRECT_URL(5432)을 쓰는지 확인했다
[ ] 운영 DB라면 §5 금지 명령을 다시 읽었다
[ ] seed.ts를 쓰지 않는다는 것을 확인했다
[ ] 되돌릴 수 없는 작업이면 창업자 승인을 받았다
```

### 실행 중 — 🛑 즉시 중단 기준

```
1. 대상 DB 테이블 수가 예상과 다르다
2. P1017 "Server has closed the connection"  → pooler(6543)를 쓰고 있다
3. 42710 duplicate_object                    → 이미 존재. 재실행 상황이다
4. DDL 중간 실패                              → 재실행하지 말고 S3
5. 예상하지 못한 DELETE / DROP 로그
6. BoardConfig 행 수가 줄었다
```

### 실행 후 검증

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE';                      -- 46
SELECT count(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid
WHERE n.nspname='public' AND t.typtype='e';                                   -- 36
SELECT count(*) FROM information_schema.table_constraints
WHERE table_schema='public' AND constraint_type='FOREIGN KEY';                -- 34
SELECT tablename FROM pg_tables WHERE schemaname='public'
AND tablename IN ('User','Post','Comment','BoardConfig','AdminAccount');      -- 5행
SELECT "boardType","displayName","isActive" FROM "BoardConfig";
SELECT count(*) FROM "AdminAccount";
```

```bash
npx prisma generate
npx tsc --noEmit
npx tsc -p tsconfig.ops.json --noEmit
curl -sI <URL>/community/<slug>    # 200
curl -sI <URL>/api/health/auth     # 200
```

### 사고 발생 시 보고 양식

```
발생 시각      YYYY-MM-DD HH:MM KST
대상 DB        운영 / 빈 DB / 신규 project
실행한 명령    (전문 그대로. 축약 금지)
사용한 URL     DATABASE_URL / DIRECT_URL  ← 값이 아니라 키 이름만
시나리오       S1~S9 중 어느 것이라 판단했는가
증상           에러 코드 · 로그
피해 범위      테이블 수 · 행 수 · 삭제 여부
현재 상태      중단 / 진행 중 / 복구 완료
필요한 결정    창업자 승인이 필요한 항목
```

---

## 8. 🔔 미확정 / 창업자 확인 필요

| # | 항목 | 왜 중요한가 | 확인 방법 |
|---|---|---|---|
| ~~**1**~~ | ~~Supabase 백업 / PITR 정책~~ → ✅ **확인 완료 (2026-08-20, 창업자)** | 결과는 §8-1 참조. **daily backup은 있으나 PITR은 비활성**이라 정밀 복구는 불가하다 | 해소됨 |
| 2 | 운영 DB에 `seed_` 계정이 실제 존재하는지 | seed.ts `deleteMany` 3건의 실제 피해 범위가 결정된다 | read-only SELECT |
| 3 | 운영 DB 실제 테이블 수가 46인지 | 이번 감사는 DB에 접속하지 않았다 | §1-1 쿼리 |
| 4 | `_prisma_migrations` 현재 행 수 | 문서상 43건이나 재확인하지 않았다 | read-only SELECT |
| 5 | 어드민 화면에서 BoardConfig 복구가 실제 가능한지 | S4의 A안 성립 여부 | 코드 확인 또는 어드민 조작 |
| 6 | `pooler-issues.md` 예시의 `DATABASE_URL` | 오류로 보이나 의도적일 가능성 배제 못 함 **[추정]** | 문서 작성 경위 확인 |

### 8-1. ✅ Supabase 백업 실태 (2026-08-20 창업자 콘솔 확인)

```
✅ Scheduled backups 있음
   "Projects are backed up daily around midnight of your project's region
    and can be restored at any time."
   목록 실측: 19 Aug 14:45:16 (+0000) · 18 · 17 · 16 · 15 · 14 · 13 Aug
   → 일 1회 · 최근 7일치 보유 확인
   상태: COMPLETED 또는 PHYSICAL

✅ Restore 가능
   각 백업 옆 Restore 버튼
   "Restore to new project (BETA)" 탭 존재 — 운영 DB를 덮지 않고 비교 가능

🔴 PITR 비활성
   Point in time 탭: "Point in Time Recovery is available as an add-on"
   "Enable add-on" 버튼 상태
   → **특정 시각 복구는 현재 보장되지 않는다**

🔴 Storage 객체 미포함
   "Storage objects are not included"
   DB 백업은 Storage API 객체 자체를 복원하지 않고 metadata만 포함한다
   → 이미지·파일은 별도 백업 전략이 필요하다 (§8-3)
```

### 8-2. 🔴 PITR 부재가 복구에 미치는 영향

```
할 수 있는 것    일 단위 복구 — 자정 무렵 스냅샷 기준
                 restore-to-new-project 로 운영 DB를 건드리지 않고 비교

할 수 없는 것    🔴 "사고 5분 전"으로 되돌리기
                 → 마지막 백업 이후 발생한 실회원 글·댓글·가입은 복구되지 않는다

의미
  사고가 자정 직후에 나면 최대 24시간치가 유실될 수 있다.
  즉 **"복구 가능"이지만 "무손실 복구"는 아니다.**
```

⚠️ **백업이 확인됐다고 해서 파괴적 명령의 위험이 낮아진 것은 아니다.**
PITR이 없으므로 §5 금지 명령은 그대로 유효하다.

### 8-3. 🚫 이 문서의 범위 밖 — Storage 백업

```
DB 백업에 Storage 객체가 포함되지 않는다(확인됨).
따라서 아래는 이 문서로 복구할 수 없다.
  · Supabase Storage 파일
  · Cloudflare R2 이미지 (CLOUDFLARE_R2_BUCKET)
  · 본문 첨부 이미지 · 썸네일 · OG 이미지

→ 별도 과제로 분리한다: **R2 / Supabase Storage 백업 전략**
   docs/operations/m3-new-brand-readiness.md §19 backlog에 추가 대상
⚠️ 현재 이 영역의 백업 정책은 확인되지 않았다.
```

---

## 9. 관련 문서

```
.claude/commands/prisma-guide/prisma-guide.md          핵심 규칙 · 멱등성 패턴
.claude/commands/prisma-guide/references/pooler-issues.md   pg 직접 실행 코드
.claude/commands/prisma-guide/references/enum-migration.md  enum 추가·변경
.claude/commands/prisma-guide/references/common-errors.md
.claude/commands/prisma-guide/gotchas.md
docs/operations/m3-new-brand-readiness.md §14-5~14-8   M3 빈 DB 초기화
docs/operations/m3-new-brand-readiness.md §19 P0-3     우나어 backlog
```

---

*최종 갱신 2026-08-20 · P0-3A/3B + Supabase 백업 확인 반영*
*다음 갱신: 미확정 5건(§8) 해소 시 · R2/Storage 백업 전략 확정 시*
