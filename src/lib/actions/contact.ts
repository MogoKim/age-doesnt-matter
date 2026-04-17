'use server'

import { Resend } from 'resend'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

const resend = new Resend(process.env.RESEND_API_KEY)

interface ContactData {
  type: 'service' | 'biz'
  name?: string
  email?: string
  message: string
  _honey?: string
}

export async function submitContact(data: ContactData): Promise<{ error?: string }> {
  // 1. honeypot — 봇이면 채워짐, 조용히 무시
  if (data._honey) return {}

  // 2. Rate limit (IP 기반, 1시간 3회)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = checkRateLimit(`contact:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) return { error: '잠시 후 다시 시도해 주세요.' }

  // 3. 입력값 검증
  const message = data.message.trim()
  if (message.length < 10) return { error: '문의 내용을 10자 이상 입력해 주세요.' }
  if (message.length > 500) return { error: '500자 이내로 입력해 주세요.' }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: '이메일 주소 형식을 확인해 주세요.' }
  }

  // 4. 이메일 전송
  const typeLabel = data.type === 'service' ? '서비스 문의' : '제휴·광고 문의'
  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'korea.age.not.matter@gmail.com',
    subject: `[우나어 문의] ${typeLabel}`,
    text: [
      `유형: ${typeLabel}`,
      `이름: ${data.name?.trim() || '(미입력)'}`,
      `연락 이메일: ${data.email?.trim() || '(미입력)'}`,
      ``,
      `문의 내용:`,
      message,
    ].join('\n'),
  })

  if (error) return { error: '전송 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' }
  return {}
}
