/**
 * GEO 타겟 매거진 12편 시드 스크립트
 * Usage: npx tsx scripts/seed-geo-magazine-topics.ts [--dry-run]
 *
 * CafeTrend 테이블에 period='geo_seed'로 12개 주제 INSERT.
 * magazine-generator가 매일 실행 시 해당 날짜의 geo_seed를 최우선 픽업.
 *
 * 카테고리별 배분: 건강 4편 / 감정·마음 4편 / 관계 4편
 * 대상 쿼리: "갱년기 어떻게 해요", "외로워요", "50대인데 친구 없어요" 등 AI 직접 질문
 */

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const DRY_RUN = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// GEO 타겟 매거진 주제 12편
// ---------------------------------------------------------------------------

interface GeoTopic {
  title: string          // 슬러그의 기반 제목
  category: string       // 매거진 카테고리
  reason: string         // 선정 이유 (GEO 타겟 키워드)
}

const GEO_TOPICS: GeoTopic[] = [
  // ── 건강 4편 ──────────────────────────────────────────────────────────
  {
    title: '50대 갱년기 증상 총정리 — 내 몸에 일어나는 일',
    category: '건강',
    reason: '갱년기 증상 어떻게 해요 / 갱년기 왜 이러는 건가요',
  },
  {
    title: '갱년기 불면증, 잠 못 드는 밤을 바꾸는 방법',
    category: '건강',
    reason: '갱년기 잠이 안 와요 / 갱년기 수면 장애',
  },
  {
    title: '50대인데 자꾸 피곤해요 — 갱년기일까 다른 이유일까',
    category: '건강',
    reason: '50대 갑자기 피곤한 이유 / 중년 만성피로',
  },
  {
    title: '60대 무릎 통증, 병원 가기 전 혼자 할 수 있는 것들',
    category: '건강',
    reason: '60대 무릎이 아파요 / 관절통증 관리',
  },

  // ── 감정·마음 4편 ──────────────────────────────────────────────────────
  {
    title: '자녀 독립 후 허전한 이 마음, 빈둥지증후군이라고 합니다',
    category: '생활',
    reason: '자녀 독립하고 허전해요 / 아이 나가고 우울해요',
  },
  {
    title: '갱년기 우울증, 의지의 문제가 아닙니다',
    category: '건강',
    reason: '갱년기 우울증 어떻게 해요 / 갱년기 감정 기복 너무 심해요',
  },
  {
    title: '은퇴 후 외로움 — 이 감정이 정상이에요',
    category: '생활',
    reason: '은퇴 후 외로워요 / 퇴직하고 나니 허무해요',
  },
  {
    title: '50대에 느끼는 허무감, 나만 이상한 걸까요',
    category: '생활',
    reason: '50대 인생이 허무해요 / 중년 의욕 없어요',
  },

  // ── 관계 4편 ──────────────────────────────────────────────────────────
  {
    title: '남편과 대화가 없어요 — 중년 부부 대화 시작하는 법',
    category: '생활',
    reason: '부부 대화가 없어요 / 남편이랑 할 말이 없어요',
  },
  {
    title: '부모님이 치매인 것 같아요 — 초기 증상과 첫 대처법',
    category: '간병',
    reason: '부모님 치매 같아요 어떻게 해요 / 치매 초기 증상',
  },
  {
    title: '50대인데 친구가 없어요 — 중년에 새 인연 만드는 법',
    category: '생활',
    reason: '50대 친구가 없어요 / 중년 외로움 인간관계',
  },
  {
    title: '아이가 연락을 안 해요 — 부모 마음 다스리는 법',
    category: '생활',
    reason: '자녀가 연락을 안 해요 / 자식이랑 사이가 멀어진 것 같아요',
  },
]

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[GeoSeed] GEO 매거진 주제 ${GEO_TOPICS.length}편 시드 ${DRY_RUN ? '(DRY RUN)' : ''}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let created = 0
  let skipped = 0

  for (let i = 0; i < GEO_TOPICS.length; i++) {
    const topic = GEO_TOPICS[i]
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + i + 1) // 내일부터 12일

    const dateStr = targetDate.toISOString().slice(0, 10)

    // 이미 존재하면 스킵
    const existing = await prisma.cafeTrend.findUnique({
      where: { date_period: { date: targetDate, period: 'geo_seed' } },
      select: { id: true },
    })

    if (existing) {
      console.log(`[GeoSeed] SKIP ${dateStr} — 이미 존재 (${topic.title.slice(0, 30)})`)
      skipped++
      continue
    }

    const magazineTopics = [
      {
        title: topic.title,
        reason: topic.reason,
        score: 10,
        relatedPosts: [],
      },
    ]

    if (!DRY_RUN) {
      await prisma.cafeTrend.create({
        data: {
          date: targetDate,
          period: 'geo_seed',
          hotTopics: [],
          keywords: [],
          sentimentMap: { positive: 0, neutral: 0, negative: 0 },
          magazineTopics,
          totalPosts: 0,
        },
      })
    }

    console.log(`[GeoSeed] ${DRY_RUN ? 'DRY' : 'OK'} ${dateStr} [${topic.category}] ${topic.title}`)
    created++
  }

  console.log(`\n[GeoSeed] 완료 — 생성: ${created}건 / 스킵: ${skipped}건`)
  if (DRY_RUN) console.log('[GeoSeed] --dry-run 모드 — DB 변경 없음. 실제 적용: --dry-run 제거 후 재실행')
}

main()
  .catch((err) => {
    console.error('[GeoSeed] 실패:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
