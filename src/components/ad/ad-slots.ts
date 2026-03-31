/**
 * 광고 슬롯 ID 상수
 * AdSense + Coupang Partners 광고 유닛 ID 중앙 관리
 */

// ── Google AdSense ──
export const ADSENSE = {
  CLIENT_ID: 'ca-pub-4117999106913048',

  /** 홈 섹션 사이 — 디스플레이 광고 (모바일/PC 공통, 홈 섹션 간 배너) */
  HOME_SECTION: '9127452149',

  /** 피드 사이 — 인피드 광고 (목록 페이지에서 글 사이 자연스럽게 노출) ⭐ CTR 최고 */
  IN_FEED: '5592036395',
  IN_FEED_LAYOUT_KEY: '-fl+4d+bg-ak-gr',

  /** 글 본문 — 인아티클 광고 (글/매거진/일자리 상세 본문 아래) */
  IN_ARTICLE: '2965873058',

  /** PC 사이드바 — 디스플레이 광고 (데스크탑 전용 우측 사이드바) */
  PC_SIDEBAR: '4568825260',
} as const

// ── Coupang Partners ──
export const COUPANG = {
  TRACKING_CODE: 'AF3181348',

  /** 다이나믹 배너 — 모바일 (320x100) */
  DYNAMIC_MOBILE: { id: 976335, width: 320, height: 100 },

  /** 다이나믹 배너 — 데스크탑 사이드바 (300x250) */
  DYNAMIC_DESKTOP: { id: 976336, width: 300, height: 250 },

  /** 카테고리 배너 — 로켓프레시 (320x100) */
  CATEGORY_FRESH: {
    bannerId: 976338,
    url: 'https://link.coupang.com/a/edTKOs',
    imgSrc: 'https://ads-partners.coupang.com/banners/976338?subId=&traceId=V0-301-371ae01f4226dec2-I976338&w=320&h=100',
    alt: '로켓프레시',
  },

  /** 카테고리 배너 — 로켓주방용품 (320x100) */
  CATEGORY_KITCHEN: {
    bannerId: 976342,
    url: 'https://link.coupang.com/a/edTNKp',
    imgSrc: 'https://ads-partners.coupang.com/banners/976342?subId=&traceId=V0-301-2b8ef06377ec8f50-I976342&w=320&h=100',
    alt: '로켓주방용품',
  },

  /** 검색 위젯 — 데스크탑 (100% x 75px) */
  SEARCH_DESKTOP: 'https://coupa.ng/cl74pX',
  /** 검색 위젯 — 모바일 (100% x 44px) */
  SEARCH_MOBILE: 'https://coupa.ng/cl74pY',

  /** 상품 캐러셀 — 매거진 전용 (320x250) */
  PRODUCT_CAROUSEL: { id: 976346, width: 320, height: 250 },
} as const
