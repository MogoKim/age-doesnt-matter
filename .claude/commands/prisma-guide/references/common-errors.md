# Prisma 자주 발생하는 에러

## "The column (not available) does not exist"
**원인:** schema.prisma에 컬럼을 추가하고 generate 했지만 실제 DB에 컬럼이 없음
**해결:** ALTER TABLE로 DB에 컬럼 추가 후 재시도

## "Can't reach database server"
**원인:** DATABASE_URL이 없거나 네트워크 문제
**해결:** .env.local 파일에 DATABASE_URL 확인. dotenv 로드 여부 확인.

## "Unique constraint failed"
**원인:** 이미 존재하는 unique 값으로 INSERT 시도
**해결:** upsert 사용하거나 존재 여부 먼저 확인

## Prisma client out of sync
**원인:** schema 변경 후 generate 안 함
**해결:** `npx prisma generate` 실행
