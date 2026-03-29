'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createAdminToken, setAdminCookie, clearAdminCookie } from '@/lib/admin-auth'
import { checkRateLimit } from '@/lib/rate-limit'

export async function adminLogin(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 입력해 주세요.' }
  }

  const rateCheck = checkRateLimit(`admin-login:${email}`, { limit: 5, windowMs: 15 * 60 * 1000 })
  if (!rateCheck.allowed) {
    const minutes = Math.ceil(rateCheck.remainingMs / 60_000)
    return { error: `로그인 시도가 너무 많습니다. ${minutes}분 후 다시 시도해 주세요.` }
  }

  try {
    const admin = await prisma.adminAccount.findUnique({
      where: { email },
    })

    if (!admin) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash)
    if (!isValid) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    }

    // 마지막 로그인 시간 업데이트
    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const token = await createAdminToken({
      adminId: admin.id,
      email: admin.email,
      nickname: admin.nickname,
    })

    await setAdminCookie(token)
  } catch (e) {
    console.error('[adminLogin] error:', e)
    return { error: `로그인 처리 중 오류: ${e instanceof Error ? e.message : String(e)}` }
  }

  redirect('/admin')
}

export async function adminLogout() {
  await clearAdminCookie()
  redirect('/admin/login')
}
