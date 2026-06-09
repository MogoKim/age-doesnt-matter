import type { Metadata } from 'next'
import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { getCachedMagazinePage } from '@/lib/queries/posts'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import MagazineContent from '@/components/features/magazine/MagazineContent'

const MagazineFilter = nextDynamic(() => import('@/components/features/magazine/MagazineFilter'))

export const revalidate = 60

const CI_DUMMY_DB = process.env.CI === 'true' && process.env.DATABASE_URL?.includes('localhost:5432/dummy')

export const metadata: Metadata = {
  title: '매거진',
  description: '갱년기·건강, 재테크, 여행, 생활정보까지 신중년 여성에게 꼭 필요한 정보.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/magazine` },
  openGraph: {
    title: '매거진 | 신중년 여성 커뮤니티 : 우리 나이가 어때서',
    description: '갱년기·건강, 재테크, 여행, 생활정보까지 신중년 여성에게 꼭 필요한 정보.',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/magazine`,
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '우리 나이가 어때서 — 신중년 여성 커뮤니티' }],
  },
}

const magazineCollectionPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: '우나어 매거진 — 50·60대를 위한 정보',
  description: '건강, 재테크, 여행, 생활정보 등 50대·60대를 위한 유익한 콘텐츠. 갱년기, 기초연금, 재취업, 인생 2막 정보.',
  url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/magazine`,
  publisher: {
    '@type': 'Organization',
    name: '우나어',
    logo: {
      '@type': 'ImageObject',
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/logo.png`,
    },
  },
  about: [
    { '@type': 'Thing', name: '갱년기' },
    { '@type': 'Thing', name: '기초연금' },
    { '@type': 'Thing', name: '50대 재취업' },
    { '@type': 'Thing', name: '인생 2막' },
    { '@type': 'Thing', name: '50대 건강관리' },
    { '@type': 'Thing', name: '중장년 재테크' },
  ],
  audience: {
    '@type': 'Audience',
    audienceType: '50대·60대 중장년',
  },
}

async function getInitialMagazineData() {
  try {
    return await getCachedMagazinePage()
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
    return { posts: [], total: 0 }
  }
}

export default async function MagazinePage() {
  const initialData = await getInitialMagazineData()

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(magazineCollectionPageJsonLd) }}
      />
      <BoardViewTracker boardType="MAGAZINE" boardSlug="magazine" />
      <div className="max-w-[960px] mx-auto px-4 py-6">
        <h1 className="sr-only">매거진</h1>

        <Suspense fallback={null}>
          <MagazineFilter />
        </Suspense>

        <Suspense fallback={null}>
          <MagazineContent initialPosts={initialData.posts} initialTotal={initialData.total} />
        </Suspense>
      </div>
    </div>
  )
}
