'use server'

import { cookies, headers } from 'next/headers'
import { createHash, randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateAnswers, type SurveyQuestion, type SurveyAnswers } from '@/lib/events/survey'

const SURVEY_GUEST_COOKIE = 'unao_survey_guest_id'

/** 비회원 식별 id (SURVEY 전용 쿠키). 개인정보 아님 — 랜덤 UUID만. */
async function getOrCreateSurveyGuestId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(SURVEY_GUEST_COOKIE)?.value
  if (existing) return existing
  const newId = randomUUID()
  cookieStore.set(SURVEY_GUEST_COOKIE, newId, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' })
  return newId
}
/** 읽기 전용(응답 여부 조회 시엔 쿠키 생성 안 함) */
async function readSurveyGuestId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SURVEY_GUEST_COOKIE)?.value ?? null
}
async function getIpHash(): Promise<string> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? '0.0.0.0'
  const salt = process.env.GUEST_LIKE_SALT ?? 'unaeo-guest-like-salt'
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex')
}

export interface SurveySubmitInput {
  eventId: string
  answers: SurveyAnswers
  source?: 'popup' | 'hero' | 'direct' | 'push'
  path?: string
}
export type SurveySubmitResult = { ok: true } | { error: string; alreadyResponded?: boolean; closed?: boolean }

/**
 * 1분 의견함 응답 제출 (회원/비회원). 응답은 비공개(SurveyResponse) — Comment 아님.
 *  - 노출창(startAt~endAt) 밖이면 제출 차단(마감).
 *  - 필수 문항·동의(consent) 미충족이면 차단.
 *  - 회원 1회 / 비회원(guestId) 1회 — DB @@unique + 사전 조회 이중.
 */
export async function submitSurveyResponse(input: SurveySubmitInput): Promise<SurveySubmitResult> {
  const ev = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, type: true, isActive: true, startAt: true, endAt: true },
  })
  if (!ev || ev.type !== 'SURVEY' || !ev.isActive) return { error: '의견함을 찾을 수 없습니다' }
  const now = Date.now()
  if (now < ev.startAt.getTime()) return { error: '아직 시작 전인 의견함입니다', closed: true }
  if (now >= ev.endAt.getTime()) return { error: '마감된 의견함입니다', closed: true }

  const form = await prisma.surveyForm.findUnique({ where: { eventId: ev.id } })
  if (!form) return { error: '설문 양식을 찾을 수 없습니다' }

  const questions = form.questions as unknown as SurveyQuestion[]
  const validated = validateAnswers(questions, input.answers)
  if ('error' in validated) return { error: validated.error }

  // 동의: consent 타입 문항이 모두 true 여야 함(미체크 시 제출 차단)
  const consentQ = questions.filter((q) => q.type === 'consent')
  const consentAccepted = consentQ.length === 0 ? false : consentQ.every((q) => validated.answers[q.id] === true)
  if (consentQ.length > 0 && !consentAccepted) return { error: '개인정보·서비스 개선 동의에 체크해 주세요' }

  const session = await auth()
  const userId = session?.user?.id ?? null
  const guestId = userId ? null : await getOrCreateSurveyGuestId()

  // 중복 응답 사전 차단(회원=userId / 비회원=guestId)
  const dup = await prisma.surveyResponse.findFirst({
    where: userId ? { surveyFormId: form.id, userId } : { surveyFormId: form.id, guestId: guestId! },
    select: { id: true },
  })
  if (dup) return { error: '이미 의견을 남겨주셨어요. 고맙습니다!', alreadyResponded: true }

  const h = await headers()
  try {
    await prisma.surveyResponse.create({
      data: {
        surveyFormId: form.id,
        eventId: ev.id,
        userId,
        guestId,
        answers: validated.answers as object,
        source: input.source ?? 'direct',
        path: input.path ?? null,
        referrer: h.get('referer') ?? null,
        userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
        ipHash: await getIpHash(),
        consentAccepted,
      },
    })
  } catch (e) {
    // @@unique 경합(동시 제출) → 이미 응답으로 처리
    if ((e as { code?: string })?.code === 'P2002') return { error: '이미 의견을 남겨주셨어요. 고맙습니다!', alreadyResponded: true }
    console.error('[survey] 응답 저장 실패:', e)
    return { error: '응답 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

/** 현재 사용자(회원/비회원)가 이 의견함에 이미 응답했는지 — 화면 "이미 남겨주셨어요" 판정용(read-only, 쿠키 생성 안 함) */
export async function getSurveyResponseStatus(eventId: string): Promise<{ alreadyResponded: boolean }> {
  const form = await prisma.surveyForm.findUnique({ where: { eventId }, select: { id: true } })
  if (!form) return { alreadyResponded: false }
  const session = await auth()
  const userId = session?.user?.id ?? null
  if (userId) {
    const r = await prisma.surveyResponse.findFirst({ where: { surveyFormId: form.id, userId }, select: { id: true } })
    return { alreadyResponded: !!r }
  }
  const guestId = await readSurveyGuestId()
  if (!guestId) return { alreadyResponded: false }
  const r = await prisma.surveyResponse.findFirst({ where: { surveyFormId: form.id, guestId }, select: { id: true } })
  return { alreadyResponded: !!r }
}
