import Link from 'next/link'
import FooterFontSizeToggle from '@/components/common/FooterFontSizeToggle'
import FooterPwaButton from '@/components/common/FooterPwaButton'

const FOOTER_LINKS = [
  { label: '회사소개', href: '/about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
  { label: '자주 묻는 질문', href: '/faq' },
  { label: '커뮤니티 규칙', href: '/rules' },
  { label: '문의', href: '/contact' },
] as const

export default function Footer() {
  return (
    <footer className="bg-background px-4 py-8 border-t border-border lg:px-8 lg:py-12 lg:flex lg:flex-col lg:items-center">
      <nav className="flex flex-wrap gap-4 mb-4" aria-label="하단 링크">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary${link.href === '/privacy' ? ' font-bold' : ''}`}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-caption text-muted-foreground">글씨 크기</span>
        <FooterFontSizeToggle />
      </div>
      <div className="flex items-center gap-4 mb-4">
        <FooterPwaButton />
      </div>
      <p className="text-caption text-muted-foreground">&copy; 2026 우리 나이가 어때서</p>
      <address className="not-italic mt-3 text-center space-y-1">
        <p className="text-[13px] text-muted-foreground/70">
          케이에이지랩(K-Agelab) &nbsp;|&nbsp; 대표 김용석 &nbsp;|&nbsp; 사업자등록번호 457-24-01157
        </p>
        <p className="text-[13px] text-muted-foreground/70">
          서울특별시 노원구 월계로55길 15, 302동 912호
        </p>
      </address>
    </footer>
  )
}
