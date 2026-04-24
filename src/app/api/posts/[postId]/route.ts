import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPostDetail } from '@/lib/queries/posts'
import { handleApiError } from '@/lib/api-utils'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params
    const session = await auth()
    const post = await getPostDetail(postId, session?.user?.id)

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
    }

    return NextResponse.json(post)
  } catch (error) {
    return handleApiError(error)
  }
}
