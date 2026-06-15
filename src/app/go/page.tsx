import type { Metadata } from 'next'
import GoRedirect from './GoRedirect'

export const metadata: Metadata = {
  title: '우나어로 이동',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{
    to?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
  }>
}

export default async function GoPage({ searchParams }: PageProps) {
  const sp = await searchParams

  // 오픈 리다이렉트 방지: 내부 경로(`/`로 시작, `//` 제외)만 허용
  const to = sp.to && sp.to.startsWith('/') && !sp.to.startsWith('//') ? sp.to : '/'

  // 채널 추적 referrer 조립 (Play Console 획득보고서 + GA4)
  const parts: string[] = []
  if (sp.utm_source) parts.push(`utm_source=${sp.utm_source}`)
  if (sp.utm_medium) parts.push(`utm_medium=${sp.utm_medium}`)
  if (sp.utm_campaign) parts.push(`utm_campaign=${sp.utm_campaign}`)
  const referrer = parts.join('&')

  // 웹 이동 시 utm 부착 (GA4 추적)
  const webTo = referrer ? `${to}${to.includes('?') ? '&' : '?'}${referrer}` : to

  return <GoRedirect to={to} referrer={referrer} webTo={webTo} />
}
