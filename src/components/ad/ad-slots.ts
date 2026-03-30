/**
 * 광고 슬롯 ID 상수
 * AdSense + Coupang Partners 광고 유닛 ID 중앙 관리
 */

// ── Google AdSense ──
export const ADSENSE = {
  CLIENT_ID: 'ca-pub-4117999106913048',

  /** 섹션 사이 — 디스플레이 광고 (게시글 상/하단, 보드 리스트 인라인) */
  SECTION_BETWEEN: '4387790031',

  /** 피드 사이 — 인피드 광고 (홈 피드, 베스트, 검색결과, 매거진 목록) */
  IN_FEED: '3489844591',
  IN_FEED_LAYOUT_KEY: '-fl+4u+9l-c6-8u',

  /** 글 본문 — 인아티클 광고 (게시글/매거진/일자리 상세 본문 영역) */
  IN_ARTICLE: '4367811991',

  /** 사이드바 — 디스플레이 광고 (데스크탑 사이드바) */
  SIDEBAR: '2176762926',
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
