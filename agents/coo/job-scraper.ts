/**
 * COO 에이전트 — 일자리 자동 수집 (50plus.or.kr)
 *
 * 파이프라인:
 *   1. 50plus.or.kr 크롤링 (Playwright)
 *   2. DB 중복 체크 (sourceUrl)
 *   3. Waterfall 필터링 + 쿼터 적용
 *   4. AI 가공 (Claude Haiku — 제목/SEO/Pick포인트/Q&A)
 *   5. Post + JobDetail DB INSERT
 *   6. Telegram 요약 알림
 *
 * 스케줄: 하루 3회 (12:00, 16:00, 20:00 KST)
 * 1배치: 4-5건 엄선
 */

import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyTelegram } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'
import type { RawJob } from './job-types.js'
import { filterJobs, summarizeFilter } from './job-filter.js'
import { JobProcessor, buildJobContent } from './job-processor.js'

const LIST_URL = 'https://50plus.or.kr/externalList.do'
const BASE_URL = 'https://www.50plus.or.kr'
const MAX_SCRAPE = 30 // 목록에서 최대 수집 건수
const BATCH_SIZE = 5  // 최종 게시 목표 건수

class COOJobScraper extends BaseAgent {
  constructor() {
    super({
      name: 'COO_JOB_SCRAPER',
      botType: 'COO',
      role: 'COO (운영총괄 — 일자리 자동 수집)',
      model: 'light',
      tasks: '50plus.or.kr 일자리 크롤링 → AI 가공 → DB 저장',
      canWrite: true,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    // 봇 유저 확인 (일자리 게시용)
    const botUser = await this.ensureBotUser()

    // Step 1: 크롤링
    console.log('[JobScraper] Step 1: 50plus.or.kr 크롤링 시작')
    const rawJobs = await this.scrape()
    console.log(`[JobScraper] ${rawJobs.length}건 수집 완료`)

    if (rawJobs.length === 0) {
      return {
        agent: this.config.name,
        success: true,
        summary: '수집된 공고 0건 — 스킵',
      }
    }

    // Step 2: DB 중복 체크
    console.log('[JobScraper] Step 2: 중복 체크')
    const newJobs = await this.deduplicateJobs(rawJobs)
    console.log(`[JobScraper] 신규 ${newJobs.length}건 (중복 제외 ${rawJobs.length - newJobs.length}건)`)

    if (newJobs.length === 0) {
      return {
        agent: this.config.name,
        success: true,
        summary: `수집 ${rawJobs.length}건 — 전부 중복, 게시 0건`,
      }
    }

    // Step 3: Waterfall 필터링
    console.log('[JobScraper] Step 3: Waterfall 필터링')
    const filtered = filterJobs(newJobs, { batchSize: BATCH_SIZE })
    const filterSummary = summarizeFilter(filtered)
    console.log(`[JobScraper] 필터 결과: ${filterSummary}`)

    // Step 4: AI 가공
    console.log('[JobScraper] Step 4: AI 가공 시작')
    const processor = new JobProcessor()
    let publishedCount = 0

    for (const job of filtered) {
      try {
        const processed = await processor.process(job)
        const content = buildJobContent(job, processed)

        // Step 5: DB INSERT
        await prisma.post.create({
          data: {
            boardType: 'JOB',
            title: processed.cleanTitle,
            content,
            summary: processed.subtitle,
            authorId: botUser.id,
            source: 'BOT',
            status: 'PUBLISHED',
            publishedAt: new Date(),
            seoTitle: `${processed.cleanTitle} | 우나어 일자리`,
            seoDescription: `${processed.subtitle} ${processed.seoKeywords.join(' ')}`,
            jobDetail: {
              create: {
                company: job.company,
                salary: job.salary,
                workHours: job.workHours,
                workDays: job.workDays,
                location: job.location,
                region: job.region,
                jobType: job.jobType,
                applyUrl: job.applyUrl,
                pickPoints: JSON.parse(JSON.stringify(processed.pickPoints)),
                qna: JSON.parse(JSON.stringify(processed.qna)),
                quickTags: processed.seoKeywords,
                tier: job.tier,
                sourceUrl: job.sourceUrl,
                sourceId: job.sourceId,
              },
            },
          },
        })

        publishedCount++
        console.log(`[JobScraper] ✅ 게시 완료: ${processed.cleanTitle}`)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[JobScraper] ❌ 게시 실패: ${job.title} — ${errMsg}`)
      }
    }

    // Step 6: 알림
    const summary = `일자리 자동 수집 완료\n수집: ${rawJobs.length}건 → 신규: ${newJobs.length}건 → 필터: ${filtered.length}건 → 게시: ${publishedCount}건\n${filterSummary}`

    await notifyTelegram({
      level: publishedCount > 0 ? 'info' : 'important',
      agent: this.config.name,
      title: `일자리 ${publishedCount}건 게시`,
      body: summary,
    })

    // BotLog에 상세 기록
    await prisma.botLog.create({
      data: {
        botType: 'JOB',
        status: publishedCount > 0 ? 'SUCCESS' : 'PARTIAL',
        collectedCount: rawJobs.length,
        filteredCount: filtered.length,
        publishedCount,
        action: 'JOB_SCRAPE',
        details: filterSummary,
        executionTimeMs: 0, // BaseAgent.execute()에서 덮어씀
      },
    })

    return {
      agent: this.config.name,
      success: true,
      summary,
      data: {
        collected: rawJobs.length,
        new: newJobs.length,
        filtered: filtered.length,
        published: publishedCount,
      },
    }
  }

  /** 50plus.or.kr 크롤링 (Playwright) */
  private async scrape(): Promise<RawJob[]> {
    // playwright는 동적 import (GitHub Actions에서만 설치)
    const { chromium } = await import('playwright')
    const jobs: RawJob[] = []

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    try {
      const page = await context.newPage()
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // 일자리 카드 로딩 대기
      try {
        await page.waitForSelector('li.job-card', { timeout: 10000 })
      } catch {
        console.warn('[JobScraper] li.job-card 셀렉터 대기 타임아웃')
      }
      await page.waitForTimeout(2000)

      const jobCards = page.locator('li.job-card')
      const count = await jobCards.count()
      console.log(`[JobScraper] 페이지에서 ${count}개 공고 발견`)

      for (let i = 0; i < Math.min(count, MAX_SCRAPE); i++) {
        try {
          const card = jobCards.nth(i)

          // 제목
          const titleEl = card.locator('h3.title-line')
          const title = (await titleEl.count()) > 0 ? await titleEl.innerText() : ''
          if (!title) continue

          // 링크
          const linkEl = card.locator('a').first()
          const href = (await linkEl.count()) > 0 ? await linkEl.getAttribute('href') : null
          const sourceUrl = href ? (href.startsWith('http') ? href : `${BASE_URL}${href}`) : ''

          // 급여/지역/회사 (dl.recruitment-info dd)
          const ddItems = card.locator('dl.recruitment-info dd')
          const ddCount = await ddItems.count()

          const salary = ddCount >= 1 ? (await ddItems.nth(0).innerText()).trim() : ''
          const regionRaw = ddCount >= 2 ? (await ddItems.nth(1).innerText()).trim() : ''
          const company = ddCount >= 3 ? (await ddItems.nth(2).innerText()).trim() : ''

          // 지역 파싱 (첫 단어만)
          const region = regionRaw.split(' ')[0] || regionRaw

          // 상세 페이지 크롤링 (외부 링크 제외)
          let detail: { workHours?: string; jobType?: string; description?: string } = {}
          if (sourceUrl && !sourceUrl.includes('work24.go.kr') && !sourceUrl.includes('work.go.kr')) {
            detail = await this.fetchDetail(browser, sourceUrl)
          }

          // sourceId 추출 (URL에서)
          const sourceId = this.extractSourceId(sourceUrl)

          jobs.push({
            sourceId,
            sourceUrl,
            title: title.trim(),
            company: company || '정보없음',
            location: regionRaw,
            region,
            salary: salary || undefined,
            workHours: detail.workHours,
            jobType: detail.jobType,
            description: detail.description,
            applyUrl: sourceUrl,
          })
        } catch (err) {
          console.warn(`[JobScraper] 카드 ${i} 파싱 실패:`, err)
        }
      }
    } finally {
      await browser.close()
    }

    return jobs
  }

  /** 상세 페이지에서 추가 정보 추출 */
  private async fetchDetail(
    browser: import('playwright').Browser,
    url: string,
  ): Promise<{ workHours?: string; jobType?: string; description?: string }> {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    })

    try {
      const page = await context.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
      await page.waitForTimeout(1000)

      const extractField = async (keywords: string[]): Promise<string | undefined> => {
        const ths = page.locator('th')
        const thCount = await ths.count()
        for (let i = 0; i < thCount; i++) {
          const text = await ths.nth(i).innerText()
          if (keywords.some((kw) => text.includes(kw))) {
            try {
              const td = ths.nth(i).locator('xpath=following-sibling::td').first()
              if ((await td.count()) > 0) {
                return (await td.innerText()).trim()
              }
            } catch { /* ignore */ }
          }
        }
        return undefined
      }

      const workHours = await extractField(['급여(활동)시간', '근무시간', '활동시간'])
      const jobType = await extractField(['근무(활동)형태', '고용형태', '근무형태'])

      // 상세 설명
      let description: string | undefined
      try {
        const descEl = page.locator('text=담당업무').locator('xpath=following-sibling::*').first()
        if ((await descEl.count()) > 0) {
          description = (await descEl.innerText()).trim()
        }
      } catch { /* ignore */ }

      return { workHours, jobType, description }
    } catch (err) {
      console.warn(`[JobScraper] 상세 페이지 실패: ${url}`, err)
      return {}
    } finally {
      await context.close()
    }
  }

  /** URL에서 소스 ID 추출 */
  private extractSourceId(url: string): string {
    // 50plus.or.kr URL 패턴에서 ID 추출
    const match = url.match(/[?&]id=([^&]+)/) ?? url.match(/\/([^/]+)\.do/)
    return match?.[1] ?? url
  }

  /** DB에서 중복 제거 */
  private async deduplicateJobs(jobs: RawJob[]): Promise<RawJob[]> {
    const sourceUrls = jobs.map((j) => j.sourceUrl).filter(Boolean)
    if (sourceUrls.length === 0) return jobs

    const existing = await prisma.jobDetail.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { sourceUrl: true },
    })

    const existingSet = new Set(existing.map((e) => e.sourceUrl))
    return jobs.filter((j) => !existingSet.has(j.sourceUrl))
  }

  /** 봇 유저 확인/생성 */
  private async ensureBotUser() {
    const BOT_EMAIL = 'bot-job@unao.bot'
    let user = await prisma.user.findUnique({ where: { email: BOT_EMAIL } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: BOT_EMAIL,
          nickname: '일자리봇',
          providerId: `bot-job-${Date.now()}`,
          role: 'USER',
          grade: 'WARM_NEIGHBOR',
        },
      })
      console.log('[JobScraper] 봇 유저 생성 완료:', user.id)
    }

    return user
  }
}

// 실행
const agent = new COOJobScraper()
agent.execute().then((result) => {
  console.log('[JobScraper] 결과:', result.summary)
})
