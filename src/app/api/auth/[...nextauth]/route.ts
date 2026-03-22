import { handlers } from '@/lib/auth'
import type { NextRequest } from 'next/server'

// 격리 테스트: 핸들러를 try-catch로 래핑하여 에러 로깅
const wrappedGET = async (req: NextRequest) => {
  console.log('[auth-isolation] GET:', req.nextUrl.pathname + req.nextUrl.search)
  try {
    return await handlers.GET(req)
  } catch (error) {
    console.error('[auth-isolation] GET ERROR:', error)
    throw error
  }
}

const wrappedPOST = async (req: NextRequest) => {
  console.log('[auth-isolation] POST:', req.nextUrl.pathname + req.nextUrl.search)
  try {
    return await handlers.POST(req)
  } catch (error) {
    console.error('[auth-isolation] POST ERROR:', error)
    throw error
  }
}

export { wrappedGET as GET, wrappedPOST as POST }
