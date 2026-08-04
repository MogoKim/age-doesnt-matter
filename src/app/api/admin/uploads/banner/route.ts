import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { uploadToR2 } from '@/lib/r2'
import { checkBannerImage, type BannerTarget } from '@/lib/image-dimensions'
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

    // 이 API는 히어로 배너와 광고 슬롯이 함께 쓴다. 두 지면은 렌더 비율이 달라
    // (히어로 8:3 / 광고 3:1) 규격도 다르다 — 어느 지면인지 받아서 그 규격으로 검사한다.
    // target이 없으면 히어로로 본다(기존 호출부 호환).
    const rawTarget = form.get('target')
    const target: BannerTarget = rawTarget === 'ad' ? 'ad' : 'hero'

    // 가로형 지면이라 세로·정사각은 화면에서 대부분 잘린다.
    // 규격 밖 소재가 조용히 올라가지 않도록 업로드 단계에서 막는다.
    // (치수를 못 읽는 변종은 통과시킨다 — 정상 업로드를 막는 쪽이 더 나쁘다.)
    const check = checkBannerImage(buffer, target)
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 })
    }

    const key = `banners/${randomUUID()}.${ext}`
    const { url } = await uploadToR2(buffer, key, file.type)

    return NextResponse.json({ publicUrl: url })
  } catch (err) {
    console.error('[API/admin/uploads/banner] 실패:', err)
    return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
  }
}
