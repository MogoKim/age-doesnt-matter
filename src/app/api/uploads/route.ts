import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadToR2 } from '@/lib/r2'
import { randomUUID } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  // Rate limit: 1분에 10회
  const rl = rateLimit(`upload:${session.user.id}`, { max: 10, windowMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ error: '업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]

  if (files.length === 0) {
    return NextResponse.json({ error: '파일을 선택해 주세요' }, { status: 400 })
  }

  if (files.length > 5) {
    return NextResponse.json({ error: '최대 5장까지 업로드할 수 있어요' }, { status: 400 })
  }

  // 파일 검증
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: 지원하지 않는 형식이에요 (JPG, PNG, WebP, GIF)` },
        { status: 400 },
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name}: 5MB를 초과했어요` },
        { status: 400 },
      )
    }
  }

  // 업로드 실행
  const results: { url: string; key: string }[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const key = `posts/${session.user.id}/${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await uploadToR2(buffer, key, file.type)
    results.push(result)
  }

  return NextResponse.json({ images: results })
}
