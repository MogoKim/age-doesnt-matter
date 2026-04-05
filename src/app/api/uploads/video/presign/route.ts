import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPresignedUploadUrl } from '@/lib/r2'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const ALLOWED_EXTS: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const rl = rateLimit(`upload-video:${session.user.id}`, { max: 5, windowMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ error: '업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const ext = (searchParams.get('ext') ?? 'mp4').toLowerCase()
  const contentType = ALLOWED_EXTS[ext]

  if (!contentType) {
    return NextResponse.json({ error: '지원하지 않는 형식이에요 (MP4, MOV, WebM)' }, { status: 400 })
  }

  const key = `posts/${session.user.id}/${randomUUID()}.${ext}`

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType)
    return NextResponse.json({ uploadUrl, key, publicUrl })
  } catch (err) {
    console.error('[API/uploads/video/presign] 실패:', err)
    return NextResponse.json({ error: '업로드 준비에 실패했어요', detail: String(err) }, { status: 500 })
  }
}
