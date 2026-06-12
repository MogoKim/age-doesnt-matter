import Link from 'next/link'
import FooterFontSizeToggle from '@/components/common/FooterFontSizeToggle'
import FooterPwaButton from '@/components/common/FooterPwaButton'
import FooterChannelLinks from '@/components/common/FooterChannelLinks'

const FOOTER_LINKS = [
  { label: '회사소개', href: '/about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
  { label: '자주 묻는 질문', href: '/about#faq' },
  { label: '커뮤니티 규칙', href: '/rules' },
  { label: '문의', href: '/contact' },
] as const

// 공정거래위원회 통신판매사업자 정보공개 (사업자등록번호 457-24-01157)
const BIZ_INFO_URL = 'https://www.ftc.go.kr/bizCommPop.do?wrkr_no=4572401157'

export default function Footer() {
  return (
    <footer className="bg-background px-4 py-8 border-t border-border lg:px-8 lg:py-12 lg:flex lg:flex-col lg:items-center">
      <nav className="flex flex-wrap gap-4 mb-4" aria-label="하단 링크">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`inline-flex items-center min-h-11 px-1 py-2 text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary${link.href === '/privacy' ? ' font-bold' : ''}`}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* 공식 채널 (SNS 공통 + 구글플레이 채널 차등) */}
      <div className="mb-5 w-full">
        <FooterChannelLinks />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-caption text-muted-foreground">글씨 크기</span>
        <FooterFontSizeToggle />
      </div>
      <div className="flex items-center gap-4 mb-4">
        <FooterPwaButton />
      </div>
      <p className="text-caption text-muted-foreground">&copy; 2026 우리 나이가 어때서</p>

      {/* 사업자정보 — 전자상거래법 제10조: 전체 항목 항상 표시(접지 않음). 시각 위계만 낮춤. */}
      <address className="not-italic mt-3 text-center leading-relaxed">
        <p className="text-caption text-muted-foreground/70">
          케이에이지랩(K-Agelab) &middot; 대표 김용석 &middot; 사업자등록번호 457-24-01157
          <a href={BIZ_INFO_URL} target="_blank" rel="noopener noreferrer" className="ml-2 underline transition-colors hover:text-foreground">
            사업자정보확인
          </a>
        </p>
        <p className="text-caption text-muted-foreground/70">
          통신판매업 제2023-서울서초-2160호 &middot; 서울특별시 노원구 월계로55길 15, 302동 912호
        </p>
      </address>
    </footer>
  )
}
