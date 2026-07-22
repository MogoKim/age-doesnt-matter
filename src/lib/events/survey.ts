// 1분 의견함(SURVEY) — 질문/답변 타입, 검증, 집계, 기본 템플릿 (Phase 5)
// 서버·클라 공용(순수 함수). SurveyForm.questions(Json) / SurveyResponse.answers(Json) 구조를 여기서 정의.

export type SurveyQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'rating_1_5'
  | 'short_text'
  | 'long_text'
  | 'consent'

export interface SurveyQuestion {
  id: string
  type: SurveyQuestionType
  label: string
  options?: string[] // single_choice / multiple_choice 전용
  required: boolean
}

/** answers = { [questionId]: 값 }. 타입별: single=string / multiple=string[] / rating=number / text=string / consent=boolean */
export type SurveyAnswerValue = string | string[] | number | boolean
export type SurveyAnswers = Record<string, SurveyAnswerValue>

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  single_choice: '단일 선택',
  multiple_choice: '복수 선택',
  rating_1_5: '1~5점 척도',
  short_text: '짧은 주관식',
  long_text: '긴 주관식',
  consent: '동의 체크',
}

const TEXT_MAX = 1000
const SHORT_MAX = 200

/** questions Json이 올바른 구조인지(어드민 저장 시 검증). 문제 있으면 에러 문자열, 없으면 null. */
export function validateQuestions(questions: unknown): { questions: SurveyQuestion[] } | { error: string } {
  if (!Array.isArray(questions) || questions.length === 0) return { error: '질문을 1개 이상 추가해 주세요' }
  if (questions.length > 20) return { error: '질문은 최대 20개까지 가능합니다' }
  const ids = new Set<string>()
  const out: SurveyQuestion[] = []
  for (const raw of questions) {
    const q = raw as Partial<SurveyQuestion>
    if (!q.id || typeof q.id !== 'string') return { error: '질문 id가 없습니다' }
    if (ids.has(q.id)) return { error: `질문 id 중복: ${q.id}` }
    ids.add(q.id)
    if (!q.type || !(q.type in QUESTION_TYPE_LABEL)) return { error: `알 수 없는 질문 타입: ${String(q.type)}` }
    if (!q.label || !q.label.trim()) return { error: '질문 내용을 입력해 주세요' }
    if ((q.type === 'single_choice' || q.type === 'multiple_choice')) {
      const opts = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean)
      if (opts.length < 2) return { error: `"${q.label}" 선택지를 2개 이상 입력해 주세요` }
      out.push({ id: q.id, type: q.type, label: q.label.trim(), options: opts, required: !!q.required })
    } else {
      out.push({ id: q.id, type: q.type, label: q.label.trim(), required: !!q.required })
    }
  }
  return { questions: out }
}

/** 사용자 응답 검증(제출 시). 필수 누락·형식 오류면 에러, 없으면 정규화된 answers. */
export function validateAnswers(questions: SurveyQuestion[], answersRaw: unknown): { answers: SurveyAnswers } | { error: string } {
  const answers = (answersRaw ?? {}) as Record<string, unknown>
  const out: SurveyAnswers = {}
  for (const q of questions) {
    const v = answers[q.id]
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (q.type === 'consent' && v !== true)
    if (q.required && empty) return { error: `"${q.label}" 항목은 필수입니다` }
    if (empty) continue
    switch (q.type) {
      case 'single_choice': {
        const s = String(v)
        if (!(q.options ?? []).includes(s)) return { error: `"${q.label}" 선택지가 올바르지 않습니다` }
        out[q.id] = s
        break
      }
      case 'multiple_choice': {
        const arr = (Array.isArray(v) ? v : [v]).map(String)
        if (arr.some((a) => !(q.options ?? []).includes(a))) return { error: `"${q.label}" 선택지가 올바르지 않습니다` }
        out[q.id] = arr
        break
      }
      case 'rating_1_5': {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n > 5) return { error: `"${q.label}" 점수는 1~5 사이여야 합니다` }
        out[q.id] = n
        break
      }
      case 'short_text':
        out[q.id] = String(v).slice(0, SHORT_MAX)
        break
      case 'long_text':
        out[q.id] = String(v).slice(0, TEXT_MAX)
        break
      case 'consent':
        out[q.id] = v === true
        break
    }
  }
  return { answers: out }
}

// ── 문항별 집계 (어드민 결과) ──
export type QuestionSummary =
  | { id: string; label: string; type: 'single_choice' | 'multiple_choice'; counts: { option: string; count: number; ratio: number }[]; answered: number }
  | { id: string; label: string; type: 'rating_1_5'; average: number; distribution: number[]; answered: number }
  | { id: string; label: string; type: 'short_text' | 'long_text'; texts: string[]; answered: number }
  | { id: string; label: string; type: 'consent'; accepted: number; answered: number }

export function summarizeQuestion(q: SurveyQuestion, allAnswers: SurveyAnswers[]): QuestionSummary {
  const values = allAnswers.map((a) => a[q.id]).filter((v) => v !== undefined && v !== null && v !== '')
  const answered = values.length
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const opts = q.options ?? []
    const tally: Record<string, number> = Object.fromEntries(opts.map((o) => [o, 0]))
    for (const v of values) for (const s of (Array.isArray(v) ? v : [v]).map(String)) if (s in tally) tally[s]++
    const counts = opts.map((o) => ({ option: o, count: tally[o], ratio: answered ? tally[o] / answered : 0 }))
    return { id: q.id, label: q.label, type: q.type, counts, answered }
  }
  if (q.type === 'rating_1_5') {
    const nums = values.map(Number).filter((n) => n >= 1 && n <= 5)
    const distribution = [0, 0, 0, 0, 0]
    nums.forEach((n) => { distribution[n - 1]++ })
    const average = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
    return { id: q.id, label: q.label, type: 'rating_1_5', average, distribution, answered: nums.length }
  }
  if (q.type === 'consent') {
    const accepted = values.filter((v) => v === true).length
    return { id: q.id, label: q.label, type: 'consent', accepted, answered }
  }
  return { id: q.id, label: q.label, type: q.type, texts: values.map(String), answered }
}

export const DEFAULT_CONSENT_TEXT = '남겨주신 응답은 서비스 개선 목적으로 운영자만 확인합니다. 이름·연락처 등 개인정보나 민감한 내용은 적지 말아 주세요.'

// ── 기본 템플릿 4종 (어드민: 템플릿 선택 후 수정) ──
export interface SurveyTemplate {
  key: string
  name: string
  title: string
  description: string
  questions: SurveyQuestion[]
}

const q = (id: string, type: SurveyQuestionType, label: string, opts?: string[], required = true): SurveyQuestion =>
  opts ? { id, type, label, options: opts, required } : { id, type, label, required }

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: 'improve',
    name: '서비스 개선점 묻기',
    title: '우나어, 이런 점이 좋아지면 좋겠어요',
    description: '1분이면 충분해요. 불편했던 점·바라는 점을 편하게 남겨주세요.',
    questions: [
      q('rating', 'rating_1_5', '지금 우나어에 얼마나 만족하시나요? (1 매우 불만족 ~ 5 매우 만족)'),
      q('area', 'single_choice', '가장 개선이 필요한 부분은?', ['글 읽기', '글쓰기·댓글', '화면·글씨 크기', '가입·로그인', '기타']),
      q('detail', 'long_text', '구체적으로 어떤 점이 불편했나요? (자유롭게)', undefined, false),
      q('consent', 'consent', '서비스 개선 목적으로 응답을 확인하는 데 동의합니다.'),
    ],
  },
  {
    key: 'signup_hesitation',
    name: '가입을 망설이는 이유',
    title: '가입, 무엇이 망설여지셨나요?',
    description: '가입하지 않으신 이유를 살짝 들려주세요. 더 편하게 만들게요.',
    questions: [
      q('reason', 'multiple_choice', '가입을 망설인 이유는? (여러 개 선택 가능)', ['개인정보가 걱정돼서', '가입 절차가 번거로워서', '아직 둘러보는 중이라', '카카오 로그인이 부담돼서', '기타']),
      q('detail', 'short_text', '더 하고 싶은 말이 있다면?', undefined, false),
      q('consent', 'consent', '서비스 개선 목적으로 응답을 확인하는 데 동의합니다.'),
    ],
  },
  {
    key: 'participation',
    name: '글쓰기·댓글 참여가 어려운 이유',
    title: '글쓰기·댓글, 무엇이 어려우셨어요?',
    description: '참여가 망설여진 이유를 들려주시면 더 쉽게 바꿀게요.',
    questions: [
      q('barrier', 'single_choice', '가장 큰 이유는?', ['무슨 말을 써야 할지 몰라서', '반응이 없을까 봐', '화면·글씨가 불편해서', '시간이 없어서', '기타']),
      q('help', 'long_text', '어떻게 하면 더 편하게 참여할 수 있을까요?', undefined, false),
      q('consent', 'consent', '서비스 개선 목적으로 응답을 확인하는 데 동의합니다.'),
    ],
  },
  {
    key: 'churn',
    name: '다시 오지 않는 이유',
    title: '오랜만이에요, 무엇이 아쉬우셨어요?',
    description: '자주 안 오시게 된 이유를 살짝 들려주세요.',
    questions: [
      q('reason', 'single_choice', '가장 큰 이유는?', ['볼 만한 글이 적어서', '알림이 너무 많거나 적어서', '화면이 불편해서', '그냥 바빠서', '기타']),
      q('comeback', 'short_text', '어떤 점이 있으면 다시 오고 싶으세요?', undefined, false),
      q('consent', 'consent', '서비스 개선 목적으로 응답을 확인하는 데 동의합니다.'),
    ],
  },
]
