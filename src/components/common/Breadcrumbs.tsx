'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

const BASE_URL = 'https://age-doesnt-matter.com'

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const router = useRouter()

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
      {/* 모바일: 뒤로가기 버튼 */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 min-h-[52px] px-1 text-caption text-muted-foreground mb-2 lg:hidden hover:text-primary transition-colors"
        aria-label="뒤로가기"
      >
        ← 뒤로가기
      </button>
      {/* 데스크탑: breadcrumb 경로 */}
      <nav aria-label="breadcrumb" className="mb-4 hidden lg:block">
        <ol className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1">›</span>}
              {item.href && i < items.length - 1 ? (
                <Link
                  href={item.href}
                  className="no-underline hover:text-primary transition-colors"
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
