/**
 * BreadcrumbList JSON-LD 빌더 — 재사용 유틸
 * BASE_URL은 여기 한 곳에서만 관리
 */

const BASE_URL = 'https://www.age-doesnt-matter.com'

export interface BreadcrumbItem {
  name: string
  path: string  // 상대경로 (e.g. '/community/stories')
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.path}`,
    })),
  }
}
