# Supabase Pooler 포트 문제

## 증상
`prisma migrate deploy`, `prisma db push` 실행 시:
```
P1017: Server has closed the connection
```

## 원인
Supabase pooler(포트 6543)는 트랜잭션 모드로 동작 → Prisma 마이그레이션의 장기 세션을 유지할 수 없음.

## 해결: Node.js pg 모듈로 직접 SQL 실행

```javascript
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { Pool } = require('pg');

const url = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 5432,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
});

// SQL 실행
await pool.query(`ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "newColumn" TEXT;`);
await pool.end();
```

## 검증 쿼리

```sql
-- 컬럼 존재 확인
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'SocialPost';

-- enum 값 확인
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'SocialPlatform';
```
