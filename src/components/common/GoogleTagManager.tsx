import Script from 'next/script'

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? 'AW-18086681147'

/**
 * gtag 초기화 (Server Component)
 *
 * - gtag-init inline 스크립트 → window.gtag / dataLayer 정의
 * - gtag.js 외부 스크립트는 GtagLoader(Client Component)에서 별도 처리
 * - GTM 스크립트 제거: GTE 내부 트래픽 IP 규칙 직접 편집 권한 확보를 위해
 *   (GA4 추적은 GtagLoader의 gtag/js 직접 로드로 계속 작동)
 *
 * 주의: 'use client'를 절대 추가하지 마라.
 * Client Component로 바뀌면 dangerouslySetInnerHTML 실행이 지연됨.
 */
export function GTMScript() {
  return (
    <>
      {GA4_ID && (
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA4_ID}',{send_page_view:false});
gtag('config','${GOOGLE_ADS_ID}');`,
          }}
        />
      )}
    </>
  )
}

export function GTMNoScript() {
  return null
}
