Prisma + Supabase 함정 가이드 — DB 스키마 변경, 마이그레이션, 또는 Prisma 관련 에러가 발생할 때 사용합니다. 사용자가 'DB 수정', '테이블 추가', 'Prisma 에러' 등을 말할 때 트리거됩니다.

## 핵심 규칙

1. **Prisma CLI 마이그레이션 절대 금지** — `prisma migrate`, `prisma db push` 사용 불가. Supabase pooler(6543)와 호환 안 됨.
2. **DB 변경은 Node.js pg 모듈로** — 직접 SQL 실행 (패턴: references/pooler-issues.md 참조)
3. **스키마 변경 후 반드시 검증** — `information_schema.columns`로 실제 DB 확인
4. **prisma generate 필수** — 스키마 파일 수정 후 `npx prisma generate` 실행

## 작업 순서

1. `prisma/schema.prisma` 수정
2. Node.js pg 모듈로 ALTER TABLE / CREATE TABLE SQL 실행
3. `npx prisma generate`로 클라이언트 재생성
4. `information_schema` 쿼리로 DB 반영 검증
5. `npx tsc --noEmit`으로 타입 체크

## 참조 파일
- `references/pooler-issues.md` — pooler 포트 문제 상세 + 해결 코드
- `references/enum-migration.md` — enum 타입 추가/변경 SQL 패턴
- `references/common-errors.md` — 자주 발생하는 에러 + 해결법
- `gotchas.md` — 클로드가 반복 실패하는 지점
