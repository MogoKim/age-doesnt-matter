import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: string[] = []

  try {
    // Step 1: DB connection
    steps.push('1. DB 연결 시도...')
    const admin = await prisma.adminAccount.findUnique({
      where: { email: 'admin@age-doesnt-matter.com' },
    })
    steps.push(admin ? `1. ✅ 어드민 찾음 (id: ${admin.id})` : '1. ❌ 어드민 없음')

    if (!admin) {
      return NextResponse.json({ steps, error: 'admin not found' })
    }

    // Step 2: bcrypt compare
    steps.push('2. bcrypt 비교 시도...')
    const isValid = await bcrypt.compare('admin1234!', admin.passwordHash)
    steps.push(isValid ? '2. ✅ 비밀번호 일치' : '2. ❌ 비밀번호 불일치')

    // Step 3: JWT secret check
    steps.push('3. ADMIN_JWT_SECRET 확인...')
    const secret = process.env.ADMIN_JWT_SECRET
    steps.push(secret ? `3. ✅ 시크릿 존재 (길이: ${secret.length})` : '3. ❌ ADMIN_JWT_SECRET 없음')

    // Step 4: JWT creation
    steps.push('4. JWT 생성 시도...')
    const { SignJWT } = await import('jose')
    const encodedSecret = new TextEncoder().encode(secret)
    const token = await new SignJWT({
      adminId: admin.id,
      email: admin.email,
      nickname: admin.nickname,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(encodedSecret)
    steps.push(`4. ✅ JWT 생성 성공 (길이: ${token.length})`)

    return NextResponse.json({ steps, success: true })
  } catch (e) {
    steps.push(`❌ 에러: ${e instanceof Error ? e.message : String(e)}`)
    steps.push(`스택: ${e instanceof Error ? e.stack?.slice(0, 500) : ''}`)
    return NextResponse.json({ steps, error: String(e) }, { status: 500 })
  }
}
