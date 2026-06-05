import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { uploadToR2 } from '@/lib/r2'
import { randomUUID } from 'crypto'

// 서버 경유 업로드 — 브라우저가 R2에 직접 PUT하지 않아 CORS 무관 (어느 도메인에서나 동작)
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 4 * 1024 * 1024 // Vercel 함수 body 한도(4.5MB) 고려

export async function POST(request: NextRequest) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '어드민 로그인이 필요합니다' }, { status: 401 })
  }

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json({ error: '지원하지 않는 형식 (JPG, PNG, WebP)' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '이미지는 4MB 이하만 업로드할 수 있습니다' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const key = `banners/${randomUUID()}.${ext}`
    const { url } = await uploadToR2(buffer, key, file.type)

    return NextResponse.json({ publicUrl: url })
  } catch (err) {
    console.error('[API/admin/uploads/banner] 실패:', err)
    return NextResponse.json({ error: '업로드 실패', detail: String(err) }, { status: 500 })
  }
}
