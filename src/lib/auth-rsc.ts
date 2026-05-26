import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth'

// next-auth lib/index.js에 React cache()가 없으므로 명시적 래핑
// RSC 렌더 트리 내에서 auth() JWT 복호화 + jwt callback을 request당 1회만 실행
export const getAuth = cache(auth)
