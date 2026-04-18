/**
 * Phase 2 마이그레이션: Post 테이블에 trendingScore + lastEngagedAt 컬럼 추가
 * 실행: npx tsx scripts/migrate-trending-columns.ts
 */
import 'dotenv/config'
import pg from 'pg'

// dotenv/config가 .env만 읽으므로 .env.local도 수동 로드
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

if (!connectionString) {
  console.error('DIRECT_URL 또는 DATABASE_URL 환경변수가 필요합니다')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('[Migrate] trendingScore, lastEngagedAt 컬럼 추가 시작...')

    await client.query(`
      ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
    `)
    await client.query(`
      ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "lastEngagedAt" TIMESTAMP(3);
    `)

    console.log('[Migrate] 컬럼 추가 완료. 검증 중...')

    const result = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Post' AND column_name IN ('trendingScore', 'lastEngagedAt')
    `)

    const columns = result.rows.map((r: { column_name: string }) => r.column_name)
    console.log('[Migrate] 검증 결과:', columns)

    if (columns.includes('trendingScore') && columns.includes('lastEngagedAt')) {
      console.log('[Migrate] 성공! 두 컬럼 모두 존재합니다.')
    } else {
      console.error('[Migrate] 실패: 일부 컬럼이 누락되었습니다.')
      process.exit(1)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('[Migrate] 오류:', err)
  process.exit(1)
})
