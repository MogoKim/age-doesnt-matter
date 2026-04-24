import { ImageResponse } from 'next/og'
import { getPostDetail } from '@/lib/queries/posts'

export const alt = '우리 나이가 어때서 — 커뮤니티 게시글'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: Promise<{ boardSlug: string; postId: string }>
}) {
  const { postId } = await params
  const post = await getPostDetail(postId)

  const title = post?.title ?? '우리 나이가 어때서'
  const author = post?.author?.nickname ?? ''
  const category = post?.category ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          background: 'linear-gradient(135deg, #FFF8F6 0%, #FFFFFF 50%, #FFF0ED 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* 상단: 카테고리 + 제목 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {category && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  background: '#FF6F61',
                  color: '#FFFFFF',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '22px',
                  fontWeight: 700,
                }}
              >
                {category}
              </span>
            </div>
          )}
          <h1
            style={{
              fontSize: title.length > 30 ? '42px' : '52px',
              fontWeight: 800,
              color: '#1A1A1A',
              lineHeight: 1.3,
              margin: 0,
              maxHeight: '280px',
              overflow: 'hidden',
            }}
          >
            {title}
          </h1>
          {author && (
            <p style={{ fontSize: '24px', color: '#6B7280', margin: 0 }}>
              by {author}
            </p>
          )}
        </div>

        {/* 하단: 브랜드 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#FF6F61',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: '24px',
                fontWeight: 800,
              }}
            >
              우
            </div>
            <span style={{ fontSize: '26px', fontWeight: 700, color: '#1A1A1A' }}>
              우리 나이가 어때서
            </span>
          </div>
          <span style={{ fontSize: '20px', color: '#9CA3AF' }}>
            age-doesnt-matter.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
