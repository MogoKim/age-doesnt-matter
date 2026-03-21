import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUnreadNotificationCount } from '@/lib/queries/my'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 })
  }

  const count = await getUnreadNotificationCount(session.user.id)
  return NextResponse.json({ count })
}
