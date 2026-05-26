import 'server-only'
import { auth } from '@/lib/auth'
import FAB from './FAB'

export default async function AuthFAB() {
  const session = await auth()
  return <FAB isLoggedIn={!!session?.user} />
}
