/**
 * 기존 일자리 6건 데이터 정리 스크립트
 *
 * 문제: 초기 스크래핑된 일자리들이 옛 형식 (raw 제목, SEO키워드가 quickTags에 등)
 * 해결: normalizeSalary + generateDisplayTags 규칙 기반으로 quickTags 재생성
 *
 * 실행: npx tsx scripts/fix-existing-jobs.ts
 */

import { PrismaClient } from '../src/generated/prisma/client'

const prisma = new PrismaClient()

/** "월급 2,800,000원 ~ 2,800,000원" → "월 280만원" */
function normalizeSalary(raw: string | undefined | null): string {
  if (!raw || raw.trim() === '' || raw === '정보 없음') return '급여 협의'
  const cleaned = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim()

  const rangeMatch = cleaned.match(/(\d{4,})원?\s*[~\-]\s*(\d{4,})원?/)
  if (rangeMatch) {
    const low = Math.round(parseInt(rangeMatch[1]) / 10000)
    const high = Math.round(parseInt(rangeMatch[2]) / 10000)
    if (low === high) return `월 ${low}만원`
    return `월 ${low}~${high}만원`
  }

  const singleMatch = cleaned.match(/(\d{4,})원?/)
  if (singleMatch) {
    const amount = Math.round(parseInt(singleMatch[1]) / 10000)
    if (amount >= 100) return `월 ${amount}만원`
    return `시급 ${amount.toLocaleString()}원`
  }

  const hourlyMatch = cleaned.match(/시급\s*(\d[\d,.]*)\s*(만|원)?/)
  if (hourlyMatch) {
    const val = hourlyMatch[1].replace(/,/g, '')
    if (hourlyMatch[2] === '만') return `시급 ${val}만원`
    const num = parseInt(val)
    if (num >= 10000) return `시급 ${(num / 10000).toFixed(1).replace('.0', '')}만원`
    return `시급 ${num.toLocaleString()}원`
  }

  if (/월\s*\d+만/.test(cleaned)) return cleaned.replace(/원$/, '') + (cleaned.endsWith('원') ? '' : '원')
  return raw.trim()
}

/** quickTags 재생성 (규칙 기반, 최대 3개) */
function generateDisplayTags(job: {
  title: string
  salary: string | null
  workHours: string | null
  workDays: string | null
  jobType: string | null
  description?: string | null
}): string[] {
  const tags: string[] = []
  const text = (job.title + ' ' + (job.description ?? '')).toLowerCase()

  // 1순위: 나이/경력 조건
  if (text.includes('나이무관') || text.includes('나이 무관') || text.includes('연령무관')) {
    tags.push('나이무관')
  } else if (text.includes('60대') || text.includes('65세')) {
    tags.push('60대환영')
  } else if (text.includes('50대') || text.includes('시니어')) {
    tags.push('시니어환영')
  }

  // 2순위: 경력/초보
  if (text.includes('초보') || text.includes('경력무관') || text.includes('경력 무관') || text.includes('미경력')) {
    tags.push('초보환영')
  }

  // 3순위: 근무 조건
  if (job.workHours) {
    const hours = job.workHours.toLowerCase()
    if (hours.includes('오전') || /09.*13|09.*12|08.*12/.test(hours)) tags.push('오전근무')
    else if (hours.includes('오후')) tags.push('오후근무')
  }
  if (job.workDays) {
    const days = job.workDays.toLowerCase()
    if (days.includes('주3') || days.includes('주 3')) tags.push('주3일')
    else if (days.includes('주5') || days.includes('주 5') || days.includes('월~금')) tags.push('주5일')
  }

  // 4순위: 고용 형태
  if (job.jobType) {
    if (job.jobType.includes('단기') || job.jobType.includes('일용')) tags.push('단기가능')
    else if (job.jobType.includes('정규')) tags.push('정규직')
  }

  // 야간 없음
  if (text.includes('야간없음') || text.includes('야간 없음') || text.includes('주간')) {
    tags.push('야간없음')
  }

  // 태그가 비었으면 기본 태그
  if (tags.length === 0) tags.push('시니어환영')

  return tags.slice(0, 3)
}

async function main() {
  console.log('=== 기존 일자리 데이터 정리 시작 ===\n')

  // 모든 일자리 조회
  const jobs = await prisma.jobDetail.findMany({
    include: { post: { select: { id: true, title: true, content: true } } },
  })

  console.log(`총 ${jobs.length}건 일자리 발견\n`)

  for (const job of jobs) {
    console.log(`--- [${job.post.title}] ---`)
    const changes: string[] = []

    // 1. 급여 정규화
    const normalizedSalary = normalizeSalary(job.salary)
    if (normalizedSalary !== job.salary) {
      changes.push(`  급여: "${job.salary}" → "${normalizedSalary}"`)
    }

    // 2. quickTags 재생성
    const newTags = generateDisplayTags({
      title: job.post.title,
      salary: job.salary,
      workHours: job.workHours,
      workDays: job.workDays,
      jobType: job.jobType,
    })
    const oldTags = job.quickTags
    const tagsChanged = JSON.stringify(oldTags) !== JSON.stringify(newTags)
    if (tagsChanged) {
      changes.push(`  태그: [${oldTags.join(', ')}] → [${newTags.join(', ')}]`)
    }

    if (changes.length > 0) {
      console.log(changes.join('\n'))

      await prisma.jobDetail.update({
        where: { id: job.id },
        data: {
          salary: normalizedSalary,
          quickTags: newTags,
        },
      })
      console.log('  ✅ 업데이트 완료')
    } else {
      console.log('  변경사항 없음')
    }
    console.log()
  }

  console.log('=== 정리 완료 ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
