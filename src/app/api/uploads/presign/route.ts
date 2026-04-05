import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPresignedUploadUrl } from '@/lib/r2'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const rl = rateLimit(`upload:${session.user.id}`, { max: 10, windowMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ error: '업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const contentType = searchParams.get('type') ?? 'image/jpeg'
  const ext = ALLOWED_TYPES[contentType]

  if (!ext) {
    return NextResponse.json(
      { error: '지원하지 않는 형식이에요 (JPG, PNG, WebP, GIF)' },
      { status: 400 },
    )
  }

  const key = `posts/${session.user.id}/${randomUUID()}.${ext}`

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType)
    return NextResponse.json({ uploadUrl, key, publicUrl })
  } catch (err) {
    console.error('[API/uploads/presign] 실패:', err)
    return NextResponse.json(
      { error: '업로드 준비에 실패했어요', detail: String(err) },
      { status: 500 },
    )
  }
}
