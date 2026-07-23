/**
 * 참여 이벤트 QA 픽스처 도구 (SURVEY·FEEDBACK) — 재사용.
 *
 * 목적: 상세 화면(/events/[id]) QA용 이벤트를 **안전하게(tier=HIDDEN)** 만들고 지운다.
 *   - 기본 생성은 항상 tier=HIDDEN → getExposedEvent(PRIMARY 필터)에서 탈락 → 팝업/HERO에 절대 안 뜸.
 *   - 상세는 noindex·sitemap 제외·비링크라 사용자 도달 경로 0 → 입력/제출/미노출 QA는 노출 리스크 0.
 *   - `hero-on`/`popup-on`은 **실사용자 노출 위험**이 있어 경고를 출력한다. spec에선 쓰지 말 것
 *     (입구 UI 검증은 /dev/event-preview noindex 라우트로 — DB·홈 무관, 노출 0).
 *
 * 실행 원칙 (반복 실패 방지 — 이번 세션 학습):
 *   - ⚠️ 메인 repo의 src/generated/prisma는 stale(Event/Survey 모델 없을 수 있음) →
 *     **origin/main 기준 worktree에서 `npx prisma generate` 후 실행**한다.
 *   - import는 `../src/generated/prisma/client`(확장자 없음). `.mts`/절대경로 import 금지(tsx ESM named export 실패).
 *   - PrismaClient는 반드시 `new PrismaPg({ connectionString })` adapter 필요(pooler). 기존 scripts/*.ts 패턴 동일.
 *
 * 사용법:
 *   npx tsx scripts/qa-event-fixture.ts create [survey|feedback]   # HIDDEN 생성 (기본 survey)
 *   npx tsx scripts/qa-event-fixture.ts status                     # QA 픽스처 상태표
 *   npx tsx scripts/qa-event-fixture.ts hero-on                    # ⚠️ 최근 픽스처 PRIMARY+HERO (실노출)
 *   npx tsx scripts/qa-event-fixture.ts popup-on                   # ⚠️ 최근 픽스처 PRIMARY+팝업 (실노출)
 *   npx tsx scripts/qa-event-fixture.ts hide                       # HIDDEN 복귀 (노출 종료)
 *   npx tsx scripts/qa-event-fixture.ts delete                     # QA 픽스처 전부 삭제
 */
import { config } from 'dotenv'
// worktree엔 .env.local 이 없을 수 있음 → QA_ENV_FILE 로 메인 repo .env.local 지정 가능
config({ path: process.env.QA_ENV_FILE || '.env.local' })
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL })
const prisma = new PrismaClient({ adapter })

const TAG = '[QA-EVENT-FIXTURE]'
const cmd = process.argv[2]
const arg = process.argv[3]

const SURVEY_QUESTIONS = [
  { id: 'q1', type: 'single_choice', label: '얼마나 자주 방문하시나요?', options: ['매일', '일주일에 몇 번', '가끔'], required: true },
  { id: 'q2', type: 'rating_1_5', label: '전반적인 만족도는?', required: false },
  { id: 'q3', type: 'short_text', label: '한 단어로 표현한다면?', required: false },
  { id: 'q4', type: 'long_text', label: '구체적으로 어떤 점이 불편했나요? (자유롭게)', required: false },
  { id: 'consent', type: 'consent', label: '개인정보 수집·이용에 동의합니다', required: true },
]
const LONG_DESC = 'QA 픽스처입니다. 상세 화면에는 이렇게 긴 설명이 나오지만 HERO/팝업 입구에는 노출되면 안 됩니다. 여러분의 1분이 우나어를 더 좋게 만듭니다.'

async function latestFixture() {
  return prisma.event.findFirst({ where: { title: { startsWith: TAG } }, orderBy: { createdAt: 'desc' } })
}

async function main() {
  const now = Date.now()

  if (cmd === 'create') {
    const type = arg === 'feedback' ? 'FEEDBACK' : 'SURVEY'
    const ev = await prisma.event.create({
      data: {
        type,
        title: `${TAG} ${type} — 우나어, 어떤 점이 더 좋아지면 좋을까요?`,
        description: LONG_DESC,
        tier: 'HIDDEN',
        showBottomPopup: false,
        showHero: false,
        sendPush: false,
        sendNotification: false,
        isActive: true,
        preset: 'coral',
        startAt: new Date(now - 60_000),
        endAt: new Date(now + 2 * 60 * 60_000),
        createdByAdminId: 'qa-event-fixture',
      },
    })
    if (type === 'SURVEY') {
      await prisma.surveyForm.create({
        data: {
          eventId: ev.id,
          title: `${TAG} 우나어 개선 의견`,
          description: '아래 문항에 답해 주세요.',
          consentText: '응답 내용은 서비스 개선 목적으로만 사용되며 운영자만 확인합니다.',
          createdByAdminId: 'qa-event-fixture',
          questions: SURVEY_QUESTIONS,
        },
      })
    }
    console.log(`CREATED type=${type} tier=HIDDEN eventId=${ev.id}`)
    console.log(`→ 상세 QA: /events/${ev.id}  (팝업/HERO 미노출 = 노출 리스크 0)`)
  } else if (cmd === 'hero-on' || cmd === 'popup-on') {
    const ev = await latestFixture()
    if (!ev) { console.log('NO_FIXTURE'); return }
    const channel = cmd === 'hero-on' ? { showHero: true } : { showBottomPopup: true }
    await prisma.event.update({ where: { id: ev.id }, data: { tier: 'PRIMARY', ...channel } })
    console.warn(`⚠️  ${cmd}: eventId=${ev.id} 를 PRIMARY+${cmd === 'hero-on' ? 'HERO' : '팝업'}로 노출했습니다.`)
    console.warn('⚠️  이 상태는 실사용자에게 노출됩니다. 확인 후 즉시 `hide` 또는 `delete` 하세요.')
    console.warn('⚠️  입구 UI 검증은 /dev/event-preview(noindex)로 하면 노출 없이 가능합니다.')
  } else if (cmd === 'hide') {
    const ev = await latestFixture()
    if (!ev) { console.log('NO_FIXTURE'); return }
    await prisma.event.update({ where: { id: ev.id }, data: { tier: 'HIDDEN', showHero: false, showBottomPopup: false } })
    console.log(`HIDDEN eventId=${ev.id} (노출 종료)`)
  } else if (cmd === 'delete') {
    const evs = await prisma.event.findMany({ where: { title: { startsWith: TAG } } })
    for (const ev of evs) {
      const form = await prisma.surveyForm.findUnique({ where: { eventId: ev.id } })
      if (form) {
        await prisma.surveyResponse.deleteMany({ where: { surveyFormId: form.id } })
        await prisma.surveyForm.delete({ where: { id: form.id } })
      }
      await prisma.event.delete({ where: { id: ev.id } })
      console.log(`DELETED eventId=${ev.id}`)
    }
    console.log(`DELETE_DONE count=${evs.length}`)
  } else if (cmd === 'status') {
    const evs = await prisma.event.findMany({ where: { title: { startsWith: TAG } }, orderBy: { createdAt: 'desc' } })
    for (const ev of evs) {
      const form = await prisma.surveyForm.findUnique({ where: { eventId: ev.id } })
      const rc = form ? await prisma.surveyResponse.count({ where: { surveyFormId: form.id } }) : 0
      console.log(`FIXTURE id=${ev.id} type=${ev.type} tier=${ev.tier} hero=${ev.showHero} popup=${ev.showBottomPopup} active=${ev.isActive} responses=${rc}`)
    }
    if (!evs.length) console.log('NO_FIXTURE')
  } else {
    console.log('USAGE: create [survey|feedback] | status | hero-on | popup-on | hide | delete')
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
