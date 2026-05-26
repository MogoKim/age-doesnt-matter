import 'server-only'
import { getAuth } from '@/lib/auth-rsc'
import FAB from './FAB'

export default async function AuthFAB() {
  const session = await getAuth()
  return <FAB isLoggedIn={!!session?.user} />
}
