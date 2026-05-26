import 'server-only'
import { auth } from '@/lib/auth'
import Header from './Header'
import GNB from './GNB'

// unreadCount 제거: NotificationBadge가 /api/notifications/unread-count를
// 클라이언트에서 self-fetch하므로 서버 전달 불필요
export default async function AuthNavTop() {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname

  return (
    <>
      <Header isLoggedIn={isLoggedIn} />
      <GNB isLoggedIn={isLoggedIn} nickname={nickname} />
    </>
  )
}
