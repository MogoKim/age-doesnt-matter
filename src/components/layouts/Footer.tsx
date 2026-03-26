import Link from 'next/link'

const FOOTER_LINKS = [
  { label: '회사소개', href: '/about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
  { label: '문의', href: '/contact' },
] as const

export default function Footer() {
  return (
    <footer className="bg-background px-4 py-8 border-t border-border lg:px-8 lg:py-12 lg:flex lg:flex-col lg:items-center">
      <nav className="flex flex-wrap gap-4 mb-4" aria-label="하단 링크">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-[0.88rem] text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="text-[0.88rem] text-muted-foreground">&copy; 2026 우리 나이가 어때서</p>
    </footer>
  )
}
