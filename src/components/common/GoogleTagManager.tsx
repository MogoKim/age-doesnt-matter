import Script from 'next/script'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? 'AW-18086681147'

/**
 * Google Tag Manager + gtag 초기화 (Server Component)
 *
 * - GTM inline 초기화 스크립트 → HTML에 직접 삽입 (Server Component 필수)
 * - gtag-init inline 스크립트 → window.gtag / dataLayer 정의
 * - gtag.js 외부 스크립트는 GtagLoader(Client Component)에서 별도 처리
 *
 * 주의: 'use client'를 절대 추가하지 마라.
 * Client Component로 바뀌면 dangerouslySetInnerHTML 실행이 지연되어 GTM이 미로드됨.
 */
export function GTMScript() {
  return (
    <>
      {GTM_ID && (
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
      )}
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
  if (!GTM_ID) return null

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  )
}
