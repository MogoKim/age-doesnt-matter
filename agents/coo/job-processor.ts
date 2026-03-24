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

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

export class JobProcessor {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic()
  }

  /** 단일 일자리 전체 AI 가공 */
  async process(job: FilteredJob): Promise<ProcessedJob> {
    const [titleResult, seoResult, pickResult, qnaResult] = await Promise.all([
      this.generateCleanTitle(job),
      this.generateSeoKeywords(job),
      this.generatePickPoints(job),
      this.generateQna(job),
    ])

    return {
      ...titleResult,
      seoKeywords: seoResult,
      pickPoints: pickResult,
      qna: qnaResult,
    }
  }

  /** 제목 정제: [지역] 회사명 직무명 + 감성 서브타이틀 */
  private async generateCleanTitle(job: FilteredJob): Promise<{ cleanTitle: string; subtitle: string }> {
    const response = await this.chat(`
다음 일자리 정보로 제목을 만들어주세요.

원래 제목: ${job.title}
회사: ${job.company}
지역: ${job.location}
급여: ${job.salary ?? '정보 없음'}

규칙:
1. 메인 제목: [지역명] 회사명 직무명 (팩트 위주, 30자 이내)
2. 서브 타이틀: 50-60대가 공감할 따뜻한 한 줄 (감성, 40자 이내)

JSON으로만 응답:
{"cleanTitle": "...", "subtitle": "..."}`)

    try {
      return JSON.parse(response) as { cleanTitle: string; subtitle: string }
    } catch {
      return {
        cleanTitle: `[${job.region}] ${job.company} ${job.title}`.slice(0, 30),
        subtitle: '새로운 시작을 응원합니다.',
      }
    }
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
다음 일자리의 핵심 장점 5개를 뽑아주세요.
50-60대 구직자가 가장 궁금해하는 관점에서 작성하세요.

제목: ${job.title}
회사: ${job.company}
급여: ${job.salary ?? '정보 없음'}
근무시간: ${job.workHours ?? '정보 없음'}
근무일: ${job.workDays ?? '정보 없음'}
위치: ${job.location}
상세: ${(job.description ?? '').slice(0, 500)}

규칙:
- 각 포인트는 20자 이내의 간결한 문장
- 적절한 이모지 아이콘 하나씩

JSON 배열로만 응답 (5개):
[{"point": "...", "icon": "..."}]`)

    try {
      const parsed = JSON.parse(response) as PickPoint[]
      return parsed.slice(0, 5)
    } catch {
      return [
        { point: `${job.region} 소재 근무`, icon: '📍' },
        { point: job.salary ?? '급여 협의', icon: '💰' },
        { point: job.workHours ?? '상세 문의', icon: '🕐' },
        { point: '시니어 환영', icon: '🤝' },
        { point: '안정적인 근무환경', icon: '🏢' },
      ]
    }
  }

  /** Q&A 3개 생성 */
  private async generateQna(job: FilteredJob): Promise<QnA[]> {
    const response = await this.chat(`
다음 일자리에 대해 50-60대 지원자가 실제로 궁금해할 Q&A 3개를 작성하세요.

제목: ${job.title}
회사: ${job.company}
급여: ${job.salary ?? '정보 없음'}
근무시간: ${job.workHours ?? '정보 없음'}
위치: ${job.location}
상세: ${(job.description ?? '').slice(0, 500)}

규칙:
- 질문은 실제 50-60대가 쓸 법한 자연스러운 말투
- 답변은 친절하고 구체적으로
- 나이, 경력, 체력 관련 질문 포함

JSON 배열로만 응답 (3개):
[{"q": "...", "a": "..."}]`)

    try {
      const parsed = JSON.parse(response) as QnA[]
      return parsed.slice(0, 3)
    } catch {
      return [
        { q: '나이 제한이 있나요?', a: '50-60대 지원을 환영하는 공고입니다.' },
        { q: '경력이 없어도 되나요?', a: '해당 분야 경력이 없어도 지원 가능합니다.' },
        { q: '출퇴근은 어떻게 하나요?', a: `근무지는 ${job.location}입니다. 상세 교통편은 면접 시 안내드립니다.` },
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

  // 섹션 4: 4-카드 (급여/근무/고용/복지)
  const cardsSection = `
<div class="grid grid-cols-2 gap-3 mb-6">
  <div class="bg-background rounded-xl p-4 text-center">
    <p class="text-muted-foreground text-[15px] mb-1">급여</p>
    <p class="font-bold">${job.salary ?? '협의'}</p>
  </div>
  <div class="bg-background rounded-xl p-4 text-center">
    <p class="text-muted-foreground text-[15px] mb-1">근무시간</p>
    <p class="font-bold">${job.workHours ?? '상세문의'}</p>
  </div>
  <div class="bg-background rounded-xl p-4 text-center">
    <p class="text-muted-foreground text-[15px] mb-1">근무일</p>
    <p class="font-bold">${job.workDays ?? '상세문의'}</p>
  </div>
  <div class="bg-background rounded-xl p-4 text-center">
    <p class="text-muted-foreground text-[15px] mb-1">고용형태</p>
    <p class="font-bold">${job.jobType ?? '상세문의'}</p>
  </div>
</div>`

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
