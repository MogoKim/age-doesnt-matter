import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUnreadNotificationCount } from '@/lib/queries/my'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = checkApiRateLimit(request, 'unread', { max: 30 })
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 })
  }

  const count = await getUnreadNotificationCount(session.user.id)
  return NextResponse.json({ count })
}
