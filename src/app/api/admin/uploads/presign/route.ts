import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getPresignedUploadUrl } from '@/lib/r2'
import { randomUUID } from 'crypto'

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function GET(request: Request) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '어드민 로그인이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const contentType = searchParams.get('type') ?? 'image/jpeg'
  const ext = ALLOWED_TYPES[contentType]

  if (!ext) {
    return NextResponse.json({ error: '지원하지 않는 형식 (JPG, PNG, WebP)' }, { status: 400 })
  }

  const key = `banners/${randomUUID()}.${ext}`

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType)
    return NextResponse.json({ uploadUrl, key, publicUrl })
  } catch (err) {
    console.error('[API/admin/uploads/presign] 실패:', err)
    return NextResponse.json({ error: '업로드 준비 실패', detail: String(err) }, { status: 500 })
  }
}
