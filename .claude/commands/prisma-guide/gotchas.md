# Prisma Gotchas — 클로드가 반복 실패하는 지점

1. **prisma migrate 시도하지 말 것** — 매번 "prisma db push로 해볼까요?" 제안하는 습관 있음. Supabase pooler에서 100% 실패. Node.js pg 모듈만 사용.

2. **DIRECT_URL도 안 됨** — Supabase 무료 플랜에서 DIRECT_URL(5432)도 패스워드 인증 실패. DATABASE_URL(6543)로 pg Pool 생성해야 함.

3. **스키마 변경 후 generate 빼먹음** — ALTER TABLE 성공 후 "완료"라고 보고하는데 prisma generate를 안 해서 타입 에러 발생. 반드시 generate까지 실행.

4. **information_schema 검증 빼먹음** — SQL 실행 성공 = DB 반영 아님. 반드시 SELECT로 확인.

5. **enum 추가 시 schema.prisma 수정 빼먹음** — DB에만 ALTER TYPE 하고 schema.prisma는 안 바꿔서 불일치 발생.
