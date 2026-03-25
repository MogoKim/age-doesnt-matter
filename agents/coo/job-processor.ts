/**
 * 일자리 자동화 — AI 가공 (Claude Haiku)
 *
 * 4단계 AI 호출:
 *   1. 제목 정제 (_generateCleanTitle)
 *   2. SEO 키워드 4개 (_generateSeoKeywords)
 *   3. Pick 포인트 5개 (_generatePickPoints)
 *   4. Q&A 3개 (_generateQna)
 *
 * 비용 최적화: 업무추출/자격추출은 원문에서 직접 파싱 (AI 불필요)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { FilteredJob, ProcessedJob, PickPoint, QnA } from './job-types.js'
import { normalizeSalary, generateDisplayTags } from './job-types.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

export class JobProcessor {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic()
  }

  /** 단일 일자리 전체 AI 가공 */
  async process(job: FilteredJob): Promise<ProcessedJob> {
    // 급여 정규화 (AI 불필요)
    job.salary = normalizeSalary(job.salary)

    const [titleResult, seoResult, pickResult, qnaResult] = await Promise.all([
      this.generateCleanTitle(job),
      this.generateSeoKeywords(job),
      this.generatePickPoints(job),
      this.generateQna(job),
    ])

    // 사용자 표시 태그 (AI 불필요, 규칙 기반)
    const displayTags = generateDisplayTags(job)

    return {
      ...titleResult,
      seoKeywords: seoResult,
      displayTags,
      pickPoints: pickResult,
      qna: qnaResult,
    }
  }

  /** 제목 정제: [지역] 직무명 + 감성 서브타이틀 */
  private async generateCleanTitle(job: FilteredJob): Promise<{ cleanTitle: string; subtitle: string }> {
    const response = await this.chat(`
당신은 50-60대 시니어 일자리 사이트의 편집자입니다.
아래 원시 데이터로 깔끔한 제목을 만들어주세요.

원래 제목: ${job.title}
회사: ${job.company}
지역: ${job.region}
상세주소: ${job.location}
급여: ${job.salary ?? '정보 없음'}
직무: ${job.jobType ?? '정보 없음'}

## 절대 규칙
1. 원래 제목을 그대로 사용하지 마세요. 반드시 새로 작성하세요.
2. 대괄호 [지역], (주), 주식회사, 법인명 등 딱딱한 표현을 제거하세요.
3. 메인 제목 형식: "[시/도] 직무명" (25자 이내). 예: "[서울] 도서관 사서 보조", "[세종] 시설관리 보조원"
4. 회사명이 유명하면 포함, 아니면 생략하세요. (삼성, LG 등은 포함 / (주)예스콘씨에스 같은 건 생략)
5. 서브타이틀: 이 일자리의 실질적 매력을 50대 눈높이로 한 줄 (30자 이내). 뻔한 "새로운 시작을 응원합니다" 같은 말 금지.

## 서브타이틀 좋은 예시
- "오전만 근무, 오후는 내 시간"
- "경험 없어도 괜찮아요, 친절히 알려드립니다"
- "안정적인 월급, 주말은 쉽니다"
- "체력 부담 적은 좌식 업무"

JSON으로만 응답:
{"cleanTitle": "...", "subtitle": "..."}`)

    try {
      const parsed = JSON.parse(response) as { cleanTitle: string; subtitle: string }
      // 검증: 원본 그대로이거나 불량 패턴이면 fallback
      const bad = parsed.cleanTitle.includes('(주)') ||
        parsed.cleanTitle.includes('주식회사') ||
        /\[.*\/.*\]/.test(parsed.cleanTitle) ||  // [동원/세종] 등 중첩 지역
        parsed.cleanTitle === job.title ||
        parsed.cleanTitle.length > 30 ||
        parsed.cleanTitle.length < 5
      if (bad) {
        return this.fallbackTitle(job)
      }
      return parsed
    } catch {
      return this.fallbackTitle(job)
    }
  }

  /** 제목 생성 실패 시 규칙 기반 fallback */
  private fallbackTitle(job: FilteredJob): { cleanTitle: string; subtitle: string } {
    // 직무 추출: 원본 제목에서 핵심 직무명만 뽑기
    const jobName = job.title
      .replace(/\[.*?\]/g, '')        // [지역] 제거
      .replace(/\(.*?\)/g, '')        // (주) 등 제거
      .replace(job.company, '')       // 회사명 제거
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15) || '채용'

    const cleanTitle = `[${job.region}] ${jobName}`.slice(0, 25)

    const subtitles = [
      job.salary && job.salary !== '급여 협의' ? `${job.salary}, 안정적인 근무` : null,
      job.workHours ? `근무시간 ${job.workHours}` : null,
      '경력보다 성실함을 봅니다',
    ]
    const subtitle = subtitles.find((s) => s !== null) ?? '경력보다 성실함을 봅니다'

    return { cleanTitle, subtitle }
  }

  /** SEO 키워드 4개 생성 */
  private async generateSeoKeywords(job: FilteredJob): Promise<string[]> {
    const response = await this.chat(`
다음 일자리의 SEO 키워드 4개를 생성하세요.
50-60대 구직자가 검색할 만한 키워드로 만드세요.

제목: ${job.title}
회사: ${job.company}
지역: ${job.region}
직무: ${job.jobType ?? '일반'}

JSON 배열로만 응답 (4개):
["키워드1", "키워드2", "키워드3", "키워드4"]`)

    try {
      const parsed = JSON.parse(response) as string[]
      return parsed.slice(0, 4)
    } catch {
      return [`${job.region} 일자리`, `${job.company}`, '시니어 채용', '50대 취업']
    }
  }

  /** Pick 포인트 5개 생성 */
  private async generatePickPoints(job: FilteredJob): Promise<PickPoint[]> {
    const response = await this.chat(`
다음 일자리의 핵심 매력 포인트 5개를 작성하세요.
50-60대 구직자가 "이 일자리 괜찮겠다!"라고 느낄 구체적 정보만 담으세요.

제목: ${job.title}
회사: ${job.company}
급여: ${job.salary ?? '정보 없음'}
근무시간: ${job.workHours ?? '정보 없음'}
근무일: ${job.workDays ?? '정보 없음'}
위치: ${job.location}
고용형태: ${job.jobType ?? '정보 없음'}
상세: ${(job.description ?? '').slice(0, 500)}

## 절대 금지
- "시니어 환영", "안정적인 근무환경" 같은 뻔한 문구 금지
- 이미 급여/지역으로 표시되는 정보를 반복하지 마세요
- "정보 없음"이나 "상세문의"를 포인트에 넣지 마세요

## 좋은 예시
- "주말 완전 휴무, 토·일 쉼" 🗓️
- "앉아서 하는 업무, 체력 부담 적음" 💺
- "점심 식사 제공" 🍽️
- "4대보험 완비" 🛡️
- "대중교통 접근 편리" 🚌

규칙: 각 포인트 20자 이내, 이모지 1개

JSON 배열로만 응답 (5개):
[{"point": "...", "icon": "..."}]`)

    try {
      const parsed = JSON.parse(response) as PickPoint[]
      // "상세문의"가 포함된 포인트 제거
      const filtered = parsed.filter((p) => !p.point.includes('상세문의') && !p.point.includes('정보 없음'))
      return filtered.slice(0, 5)
    } catch {
      return this.fallbackPickPoints(job)
    }
  }

  /** Pick 포인트 fallback — 실제 데이터가 있는 것만 표시 */
  private fallbackPickPoints(job: FilteredJob): PickPoint[] {
    const points: PickPoint[] = []
    if (job.salary && job.salary !== '급여 협의') points.push({ point: job.salary, icon: '💰' })
    if (job.workHours && job.workHours !== '상세문의') points.push({ point: job.workHours, icon: '🕐' })
    if (job.workDays && job.workDays !== '상세문의') points.push({ point: job.workDays, icon: '📅' })
    if (job.jobType && job.jobType !== '상세문의') points.push({ point: job.jobType, icon: '📋' })
    points.push({ point: `${job.region} 소재`, icon: '📍' })
    return points.slice(0, 5)
  }

  /** Q&A 3개 생성 */
  private async generateQna(job: FilteredJob): Promise<QnA[]> {
    const response = await this.chat(`
다음 일자리에 대해 50-60대 지원자의 실제 궁금증 Q&A 3개를 작성하세요.

제목: ${job.title}
회사: ${job.company}
급여: ${job.salary ?? '정보 없음'}
근무시간: ${job.workHours ?? '정보 없음'}
위치: ${job.location}
고용형태: ${job.jobType ?? '정보 없음'}
상세: ${(job.description ?? '').slice(0, 500)}

## 절대 금지 (이런 뻔한 Q&A 금지!)
- "나이 제한이 있나요?" + "환영합니다" ← 모든 공고에 동일하므로 의미 없음
- "경력이 없어도 되나요?" + "가능합니다" ← 구체성 0
- "출퇴근은 어떻게 하나요?" + "면접 시 안내" ← 정보 가치 0

## 좋은 Q&A 예시
- Q: "무릎이 안 좋은데 오래 서있어야 하나요?" / A: "주로 앉아서 하는 업무이며, 1시간마다 휴식 시간이 있습니다."
- Q: "컴퓨터를 잘 못 쓰는데 괜찮을까요?" / A: "간단한 엑셀 입력 정도만 하시면 됩니다. 입사 후 교육도 있어요."
- Q: "점심은 어떻게 해결하나요?" / A: "구내식당에서 무료로 제공됩니다."

규칙:
- 이 직무에 특화된 구체적 질문 (체력, 기술, 복지, 분위기)
- 질문은 50-60대 말투로 자연스럽게
- 답변은 구체적 정보 포함 (모르면 "채용담당자에게 확인해보세요"로 솔직하게)

JSON 배열로만 응답 (3개):
[{"q": "...", "a": "..."}]`)

    try {
      const parsed = JSON.parse(response) as QnA[]
      return parsed.slice(0, 3)
    } catch {
      return [
        { q: '체력적으로 힘든 업무인가요?', a: '채용담당자에게 구체적인 업무 강도를 확인해보세요.' },
        { q: '근무 중 쉬는 시간이 있나요?', a: '보통 점심시간 외 별도 휴식시간이 있으며, 면접 시 확인 가능합니다.' },
        { q: '복리후생은 어떤 게 있나요?', a: '4대보험 가입이 기본이며, 상세 복리후생은 채용담당자에게 문의해주세요.' },
      ]
    }
  }

  /** Claude Haiku 호출 */
  private async chat(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content[0]
    if (block.type === 'text') return block.text
    return ''
  }
}

/**
 * 8섹션 HTML 본문 생성 (AI 불필요 — 템플릿 기반)
 */
export function buildJobContent(job: FilteredJob, processed: ProcessedJob): string {
  const { cleanTitle, subtitle, seoKeywords, pickPoints, qna } = processed

  // 섹션 1: SEO 키워드 (sr-only)
  const seoSection = `<div class="sr-only">${seoKeywords.join(', ')}</div>`

  // 섹션 2: 회사/주소
  const companySection = `
<div class="mb-6">
  <h3 class="text-lg font-bold mb-2">${job.company}</h3>
  <p class="text-muted-foreground">${job.location}</p>
</div>`

  // 섹션 3: Pick 포인트
  const pickSection = `
<div class="mb-6">
  <h3 class="text-lg font-bold mb-3">이 일자리의 포인트</h3>
  <ul class="space-y-2">
    ${pickPoints.map((p) => `<li>${p.icon} ${p.point}</li>`).join('\n    ')}
  </ul>
</div>`

  // 섹션 4: 근무 조건 카드 (정보가 있는 것만 표시)
  const cards: Array<{ label: string; value: string }> = []
  if (job.salary && job.salary !== '급여 협의') cards.push({ label: '급여', value: job.salary })
  if (job.workHours) cards.push({ label: '근무시간', value: job.workHours })
  if (job.workDays) cards.push({ label: '근무일', value: job.workDays })
  if (job.jobType) cards.push({ label: '고용형태', value: job.jobType })

  const cardsSection = cards.length > 0
    ? `
<div class="grid grid-cols-2 gap-3 mb-6">
  ${cards.map((c) => `<div class="bg-background rounded-xl p-4 text-center">
    <p class="text-muted-foreground text-[15px] mb-1">${c.label}</p>
    <p class="font-bold">${c.value}</p>
  </div>`).join('\n  ')}
</div>`
    : ''

  // 섹션 5-6: 상세 설명 (있으면)
  const detailSection = job.description
    ? `<div class="mb-6"><h3 class="text-lg font-bold mb-2">상세 정보</h3><div class="leading-relaxed">${job.description.slice(0, 1000)}</div></div>`
    : ''

  // 섹션 7: Q&A
  const qnaSection = `
<div class="mb-6">
  <h3 class="text-lg font-bold mb-3">자주 묻는 질문</h3>
  <div class="space-y-4">
    ${qna
      .map(
        (item) => `
    <div>
      <p class="font-medium mb-1">Q. ${item.q}</p>
      <p class="text-muted-foreground">A. ${item.a}</p>
    </div>`,
      )
      .join('\n')}
  </div>
</div>`

  // 섹션 8: 지원 버튼
  const applySection = job.applyUrl
    ? `<div class="text-center mt-8"><a href="${job.applyUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center h-[52px] px-8 bg-primary text-white rounded-xl font-bold text-lg">지원하기 →</a></div>`
    : ''

  // 서브타이틀
  const subtitleSection = `<p class="text-muted-foreground text-lg mb-6 italic">${subtitle}</p>`

  return [seoSection, subtitleSection, companySection, pickSection, cardsSection, detailSection, qnaSection, applySection].join('\n')
}
