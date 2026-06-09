import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${BASE_URL}${item.href}` } : {}),
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* 모바일 뒤로가기는 page.tsx의 하드링크가 담당 (router.back() 외부 이탈 버그 방지) */}
      {/* 데스크탑: breadcrumb 경로 */}
      <nav aria-label="breadcrumb" className="mb-4 hidden lg:block">
        <ol className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1">›</span>}
              {item.href && i < items.length - 1 ? (
                <Link
                  href={item.href}
                  className="no-underline hover:text-primary-text transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}
