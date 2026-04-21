import { ImageResponse } from 'next/og'
import { getJobDetail } from '@/lib/queries/posts'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PRIMARY = '#FF6F61'
const SITE_NAME = '우리 나이가 어때서'

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = await getJobDetail(id)

  const title = job?.title ?? '채용 공고'
  const company = job?.company ?? ''
  const location = job?.location ?? ''
  const displayTitle = title.length > 50 ? title.slice(0, 50) + '…' : title

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          background: '#FFFFFF',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* 일자리 뱃지 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              background: PRIMARY,
              color: '#FFFFFF',
              padding: '8px 20px',
              borderRadius: '24px',
              fontSize: '24px',
              fontWeight: '700',
            }}
          >
            일자리
          </span>
        </div>

        {/* 제목 + 회사/위치 */}
        <div
          style={{
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingTop: '24px',
            paddingBottom: '24px',
          }}
        >
          <h1
            style={{
              fontSize: displayTitle.length > 25 ? '46px' : '54px',
              fontWeight: '800',
              color: '#1a1a1a',
              lineHeight: '1.35',
              margin: '0 0 16px 0',
            }}
          >
            {displayTitle}
          </h1>
          {(company || location) && (
            <p style={{ fontSize: '28px', color: '#666', margin: '0', display: 'flex', gap: '12px' }}>
              {company && <span>{company}</span>}
              {company && location && <span style={{ color: '#ccc' }}>·</span>}
              {location && <span>📍 {location}</span>}
            </p>
          )}
        </div>

        {/* 하단 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `4px solid ${PRIMARY}`,
            paddingTop: '24px',
          }}
        >
          <span style={{ fontSize: '26px', color: '#444', fontWeight: '600' }}>
            {SITE_NAME}
          </span>
          <span style={{ fontSize: '22px', color: '#999' }}>
            age-doesnt-matter.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
