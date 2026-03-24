import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: string[] = []

  try {
    // Step 1: getDashboardStats
    steps.push('1. getDashboardStats 시도...')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [
      todayUsers,
      todaySignups,
      todayPosts,
      todayComments,
      pendingReports,
      pendingBotReviews,
    ] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.post.count({ where: { createdAt: { gte: today }, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { createdAt: { gte: today }, status: 'ACTIVE' } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.botLog.count({ where: { reviewPendingCount: { gt: 0 } } }),
    ])
    steps.push(`1. ✅ stats: users=${todayUsers}, signups=${todaySignups}, posts=${todayPosts}, comments=${todayComments}, reports=${pendingReports}, botReviews=${pendingBotReviews}`)

    // Step 2: getRecentBotLogs
    steps.push('2. getRecentBotLogs 시도...')
    const botLogs = await prisma.botLog.findMany({
      orderBy: { executedAt: 'desc' },
      take: 10,
      distinct: ['botType'],
    })
    steps.push(`2. ✅ botLogs: ${botLogs.length}건`)

    // Step 3: AdminSidebar / AdminHeader (component imports)
    steps.push('3. ✅ 대시보드 데이터 로드 완료')

    return NextResponse.json({ steps, success: true })
  } catch (e) {
    steps.push(`❌ 에러: ${e instanceof Error ? e.message : String(e)}`)
    steps.push(`스택: ${e instanceof Error ? e.stack?.slice(0, 800) : ''}`)
    return NextResponse.json({ steps, error: String(e) }, { status: 500 })
  }
}
