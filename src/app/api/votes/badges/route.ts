import { NextRequest, NextResponse } from 'next/server'
import { getVoteBadgesForPost } from '@/lib/votes'

export const dynamic = 'force-dynamic'

// 댓글 진영 배지용 — 이 글에 연동된 투표의 userId→choice 맵 (개인정보 아님: 공개 진영 표시)
export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('postId')
  if (!postId) {
    return NextResponse.json({ error: 'postId가 필요합니다' }, { status: 400 })
  }
  try {
    const badges = await getVoteBadgesForPost(postId)
    return NextResponse.json({ badges }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[votes/badges] 조회 실패:', e)
    return NextResponse.json({ badges: null }, { status: 200 })
  }
}
