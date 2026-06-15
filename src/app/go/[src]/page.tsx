import type { Metadata } from 'next'
import GoRedirect from '../GoRedirect'

export const metadata: Metadata = {
  title: '우나어로 이동',
  robots: { index: false, follow: false },
}

// 짧은 채널 코드 → utm 매핑 (utm을 URL에 노출하지 않는 깔끔한 경로)
const CHANNELS: Record<string, { source: string; medium: string; campaign: string }> = {
  'naver-mag': { source: 'naver', medium: 'blog', campaign: 'magazine' },
  'naver-exp': { source: 'naver', medium: 'blog', campaign: 'experience' },
  threads: { source: 'threads', medium: 'social', campaign: 'post' },
  instagram: { source: 'instagram', medium: 'social', campaign: 'post' },
  facebook: { source: 'facebook', medium: 'social', campaign: 'post' },
  kakao: { source: 'kakao', medium: 'social', campaign: 'post' },
}

interface PageProps {
  params: Promise<{ src: string }>
  searchParams: Promise<{ to?: string }>
}

export default async function GoChannelPage({ params, searchParams }: PageProps) {
  const { src } = await params
  const sp = await searchParams

  // 오픈 리다이렉트 방지: 내부 경로만 허용
  const to = sp.to && sp.to.startsWith('/') && !sp.to.startsWith('//') ? sp.to : '/'

  const ch = CHANNELS[src]
  const referrer = ch
    ? `utm_source=${ch.source}&utm_medium=${ch.medium}&utm_campaign=${ch.campaign}`
    : ''
  const webTo = referrer ? `${to}${to.includes('?') ? '&' : '?'}${referrer}` : to

  return <GoRedirect to={to} referrer={referrer} webTo={webTo} />
}
