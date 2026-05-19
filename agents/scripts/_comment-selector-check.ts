// LOCAL ONLY — 댓글 셀렉터 진단용 (1회성 수동 실행)
// 목적: extractComments()의 CSS 셀렉터가 실제 Naver cafe DOM과 일치하는지 확인
// 실행: npx tsx agents/scripts/_comment-selector-check.ts
import 'dotenv/config'
import { chromium } from 'playwright'
import { prisma, disconnect } from '../core/db.js'

const CAFE_NUMERIC_IDS: Record<string, number> = {
  wgang: 29349320,
  dlxogns01: 23676262,
}

// 현재 extractComments()가 사용 중인 셀렉터 목록 (진단 대상)
const CURRENT_SELECTORS = [
  '.u_cbox_comment',
  '.CommentItem',
  '.comment_item',
  '.reply_item',
  '.cmt_text',
]

async function main() {
  console.log('[CommentSelectorCheck] 시작')
  console.log('목적: 실제 Naver cafe 댓글 DOM 구조 확인\n')

  // commentCount 분포 먼저 확인
  const [total, withComments] = await Promise.all([
    prisma.cafePost.count(),
    prisma.cafePost.count({ where: { commentCount: { gt: 0 } } }),
  ])
  console.log(`[DB 현황] 전체: ${total}건 / commentCount > 0: ${withComments}건`)

  // commentCount 있는 글 우선, 없으면 최신 글로 fallback
  const posts = await prisma.cafePost.findMany({
    where: withComments > 0 ? { commentCount: { gt: 0 } } : {},
    orderBy: withComments > 0 ? { commentCount: 'desc' } : { crawledAt: 'desc' },
    take: 5,
    select: {
      id: true,
      postUrl: true,
      commentCount: true,
      title: true,
      cafeName: true,
    },
  })

  if (posts.length === 0) {
    console.error('[CommentSelectorCheck] 크롤링된 글이 없음 — DB 확인 필요')
    await disconnect()
    return
  }

  console.log(`[CommentSelectorCheck] 진단 대상 ${posts.length}건:`)
  for (const p of posts) {
    console.log(`  [${p.commentCount}댓글] ${p.title.slice(0, 40)} (${p.cafeName})`)
  }
  console.log()

  // 크롤러와 동일한 Chrome 프로필 사용 (로그인 세션 유지)
  const userDataDir =
    process.env.CHROME_USER_DATA_DIR ??
    `${process.env.HOME}/Library/Application Support/Google/Chrome`
  const profile = process.env.CHROME_PROFILE ?? 'Profile 1'

  console.log(`[브라우저] Chrome 프로필: ${profile}`)
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    args: [
      `--profile-directory=${profile}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    viewport: { width: 1280, height: 900 },
  })

  for (const post of posts) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`[글] ${post.title.slice(0, 50)}`)
    console.log(`[댓글수] ${post.commentCount}`)
    console.log(`[원본URL] ${post.postUrl}`)

    // f-e 형식 URL 생성
    const articleId =
      post.postUrl.match(/articleid=(\d+)/i)?.[1] ??
      post.postUrl.match(/articles\/(\d+)/)?.[1]

    const cafeKey = Object.keys(CAFE_NUMERIC_IDS).find(k =>
      post.postUrl.includes(k) || post.cafeName?.includes(k === 'wgang' ? '우아한 갱년기' : '은퇴 후 50년'),
    )
    const numericId = cafeKey ? CAFE_NUMERIC_IDS[cafeKey] : null

    if (!articleId || !numericId) {
      console.warn(`[스킵] articleId(${articleId}) 또는 numericId(${numericId}) 추출 실패`)
      console.warn(`  postUrl: ${post.postUrl}`)
      continue
    }

    const feUrl = `https://cafe.naver.com/f-e/cafes/${numericId}/articles/${articleId}`
    console.log(`[f-e URL] ${feUrl}`)

    const page = await context.newPage()
    try {
      await page.goto(feUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

      // 페이지 안정화 대기
      await page.waitForTimeout(5000)

      // 1) 현재 셀렉터 매칭 여부 확인
      console.log('\n[현재 셀렉터 매칭 결과]')
      for (const sel of CURRENT_SELECTORS) {
        const count = await page.$$(sel).then(els => els.length).catch(() => -1)
        const icon = count > 0 ? '✅' : '❌'
        console.log(`  ${icon} ${sel.padEnd(25)} → ${count > 0 ? `${count}개 발견` : '없음'}`)
      }

      // 2) 실제 DOM에서 comment/cmt 포함 class 전체 추출
      const commentClasses = await page.evaluate(() => {
        const all = document.querySelectorAll('*')
        const classMap: Record<string, number> = {}
        all.forEach(el => {
          el.classList.forEach(c => {
            if (
              c.toLowerCase().includes('comment') ||
              c.toLowerCase().includes('cmt') ||
              c.toLowerCase().includes('reply') ||
              c.toLowerCase().includes('댓글')
            ) {
              classMap[c] = (classMap[c] ?? 0) + 1
            }
          })
        })
        return Object.entries(classMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
      })

      if (commentClasses.length > 0) {
        console.log('\n[댓글 관련 class 목록 (출현 빈도순)]')
        for (const [cls, cnt] of commentClasses) {
          console.log(`  .${cls.padEnd(40)} (${cnt}개)`)
        }
      } else {
        console.log('\n[⚠️] 댓글 관련 class가 DOM에서 발견되지 않음')
        console.log('  → 로그인 필요 / 댓글 섹션 별도 iframe / 지연 로드 가능성')
      }

      // 3) iframe 목록 확인
      const frames = page.frames().map(f => ({ name: f.name(), url: f.url() }))
      console.log('\n[iframe/frame 목록]')
      if (frames.length <= 1) {
        console.log('  (메인 프레임만 존재 — iframe 없음)')
      } else {
        for (const f of frames) {
          console.log(`  name="${f.name}" url=${f.url.slice(0, 80)}`)
        }
      }

      // 4) iframe 내부도 확인 (댓글이 iframe 안에 있는 경우)
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue
        try {
          const iframeCommentClasses = await frame.evaluate(() => {
            const all = document.querySelectorAll('*')
            const classMap: Record<string, number> = {}
            all.forEach(el => {
              el.classList.forEach(c => {
                if (
                  c.toLowerCase().includes('comment') ||
                  c.toLowerCase().includes('cmt') ||
                  c.toLowerCase().includes('reply')
                ) {
                  classMap[c] = (classMap[c] ?? 0) + 1
                }
              })
            })
            return Object.entries(classMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
          }).catch(() => [])

          if (iframeCommentClasses.length > 0) {
            console.log(`\n  [iframe "${frame.name()}" 내 댓글 class]`)
            for (const [cls, cnt] of iframeCommentClasses) {
              console.log(`    .${cls.padEnd(40)} (${cnt}개)`)
            }
          }
        } catch {
          // cross-origin iframe — 접근 불가
        }
      }

      // 5) 댓글 섹션으로 스크롤 후 재시도 (지연 로드 케이스)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(3000)

      const afterScrollClasses = await page.evaluate(() => {
        const all = document.querySelectorAll('*')
        const classMap: Record<string, number> = {}
        all.forEach(el => {
          el.classList.forEach(c => {
            if (c.toLowerCase().includes('comment') || c.toLowerCase().includes('cmt')) {
              classMap[c] = (classMap[c] ?? 0) + 1
            }
          })
        })
        return Object.entries(classMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
      })

      if (afterScrollClasses.length > commentClasses.length) {
        console.log('\n[스크롤 후 추가 발견된 댓글 class]')
        for (const [cls, cnt] of afterScrollClasses) {
          if (!commentClasses.some(([c]) => c === cls)) {
            console.log(`  .${cls.padEnd(40)} (${cnt}개) ← 스크롤 후 로드됨`)
          }
        }
      }

      // 6) 페이지 제목 / 로그인 상태 확인
      const title = await page.title()
      const isLoginPage = title.includes('로그인') || title.includes('login')
      console.log(`\n[페이지 제목] ${title}`)
      if (isLoginPage) {
        console.log('[⚠️] 로그인 페이지로 리다이렉트됨 → 쿠키/세션 필요')
      }

    } catch (err) {
      console.error(`[오류] ${(err as Error).message}`)
    } finally {
      await page.close()
    }

    // 글 간 딜레이
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log('[CommentSelectorCheck] 완료')
  console.log('결과를 보고 STEP 2: extractComments() 셀렉터 수정을 진행하세요')

  await context.close()
  await disconnect()
}

main().catch(async err => {
  console.error('[CommentSelectorCheck] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
