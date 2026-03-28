import Script from 'next/script'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

/**
 * Google Tag Manager + gtag.js 하이브리드 로더
 *
 * - GTM: 페이지뷰 + 향상된 측정(스크롤, 이탈 클릭 등)
 * - gtag.js: 커스텀 이벤트 직접 GA4 전송 (GTM 태그 불필요)
 */
export function GTMScript() {
  return (
    <>
      {/* GTM 스크립트 */}
      {GTM_ID && (
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
      )}

      {/* gtag.js — 커스텀 이벤트 직접 전송용 */}
      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA4_ID}',{send_page_view:false});`,
            }}
          />
        </>
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
