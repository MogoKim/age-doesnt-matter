Prisma + Supabase 함정 가이드 — DB 스키마 변경, 마이그레이션, 또는 Prisma 관련 에러가 발생할 때 사용합니다. 사용자가 'DB 수정', '테이블 추가', 'Prisma 에러' 등을 말할 때 트리거됩니다.

## 핵심 규칙

1. **Prisma CLI 마이그레이션 절대 금지** — `prisma migrate deploy` · `migrate dev` · `migrate reset` · `migrate resolve` · `db push` · `db seed` **전부 사용 불가**. Supabase pooler(6543)와 호환 안 됨. **창업자에게 이 명령들을 안내하지도 마라.**
2. **DB 변경은 Node.js pg 모듈로** — 직접 SQL 실행 (패턴: references/pooler-issues.md 참조)
3. **신규 SQL은 멱등적으로 작성** — 아래 §멱등성 참조. 재실행해도 깨지지 않아야 한다.
4. **스키마 변경 후 반드시 검증** — `information_schema.columns`로 실제 DB 확인
5. **prisma generate 필수** — 스키마 파일 수정 후 `npx prisma generate` 실행

## ⚠️ `_prisma_migrations`는 실제 스키마와 다르다 (정상)

CLI를 쓰지 않으므로 `_prisma_migrations` 이력은 채워지지 않는다. **불일치는 결함이 아니라 이 운영 방식의 당연한 결과다.**

- 2026-08-14 실측: repo `prisma/migrations` **52건** vs DB 이력 **43건** — repo-only **13건**(2026-06-12 이후). 그러나 **실제 스키마 반영률 13/13 = 100%**.
- 🔴 이 상태에서 `migrate deploy`를 실행하면 **첫 건(`add_scheduled_push`)부터 "이미 존재" 오류로 실패**하고, `_prisma_migrations`에 failed 행이 남아 **이후 모든 deploy가 영구 차단**된다.
- `prisma/migrations/*.sql` 파일은 **스키마 변경 이력의 기록물**로만 쓴다. CLI 실행 대상이 아니다.

## 멱등성 (신규 SQL 필수)

같은 SQL을 두 번 실행해도 실패하지 않게 쓴다.

```sql
CREATE TABLE IF NOT EXISTS "Foo" ( ... );
CREATE INDEX IF NOT EXISTS "Foo_bar_idx" ON "Foo"("bar");
ALTER TABLE "Foo" ADD COLUMN IF NOT EXISTS "baz" TEXT;
ALTER TYPE "MyEnum" ADD VALUE IF NOT EXISTS 'NEW_VALUE';

-- 제약조건은 IF NOT EXISTS가 없다 → DO 블록으로 감싼다
DO $$ BEGIN
  ALTER TABLE "Foo" ADD CONSTRAINT "Foo_barId_fkey"
    FOREIGN KEY ("barId") REFERENCES "Bar"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

모범 사례: `prisma/migrations/20260616010000_add_notice_tracking/migration.sql` — 테이블·인덱스·컬럼·FK 전부 멱등.

## 작업 순서

1. `prisma/schema.prisma` 수정
2. Node.js pg 모듈로 ALTER TABLE / CREATE TABLE SQL 실행 (**멱등적으로**)
3. `npx prisma generate`로 클라이언트 재생성
4. `information_schema` 쿼리로 DB 반영 검증
5. `npx tsc --noEmit`으로 타입 체크

## 참조 파일
- 🔴 **DB 재해 복구는 `docs/operations/2026-08-20-database-disaster-recovery.md`** — S1~S9 시나리오별 절차. 특히 **운영 DB에 `prisma/seed.ts` 실행 금지**(`:135-137` deleteMany 3건 + BoardConfig 전량 덮어쓰기)
- `references/pooler-issues.md` — pooler 포트 문제 상세 + 해결 코드
- `references/enum-migration.md` — enum 타입 추가/변경 SQL 패턴
- `references/common-errors.md` — 자주 발생하는 에러 + 해결법
- `gotchas.md` — 클로드가 반복 실패하는 지점
