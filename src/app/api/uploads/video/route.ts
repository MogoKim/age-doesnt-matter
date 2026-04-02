import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadToR2 } from '@/lib/r2'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  // Rate limit: 1분에 5회
  const rl = rateLimit(`upload-video:${session.user.id}`, { max: 5, windowMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ error: '업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: '파일을 선택해 주세요' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: '지원하지 않는 형식이에요 (MP4, MOV, WebM)' },
      { status: 400 },
    )
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json(
      { error: '동영상은 최대 100MB까지 업로드할 수 있어요' },
      { status: 400 },
    )
  }

  const ext = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4'
  const key = `posts/${session.user.id}/${randomUUID()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadToR2(buffer, key, file.type)

  return NextResponse.json({ url: result.url })
}
