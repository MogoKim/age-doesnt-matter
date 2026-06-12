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
    <footer className="flex flex-col items-center border-t border-border bg-background px-4 py-9 lg:px-8 lg:py-12">
      {/* 1. 정책 링크 — 가운데 정렬 */}
      <nav className="mb-6 flex flex-wrap justify-center gap-x-4 gap-y-1" aria-label="하단 링크">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`inline-flex min-h-11 items-center px-1 py-2 text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary${link.href === '/privacy' ? ' font-bold' : ''}`}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* 2. 공식 채널 (SNS 아이콘 + 구글플레이 배지) */}
      <div className="mb-7 w-full">
        <FooterChannelLinks />
      </div>

      {/* 3. 글씨 크기 + (설치 유도 실험, 현재 OFF) */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-caption text-muted-foreground">글씨 크기</span>
        <FooterFontSizeToggle />
      </div>
      <FooterPwaButton />

      {/* 4. 저작권 + 사업자정보 (전자상거래법 제10조: 전체 항목 표시, 시각 위계만 낮춤) */}
      <p className="mt-5 text-caption text-muted-foreground">&copy; 2026 우리 나이가 어때서</p>
      <address className="mt-2 text-center not-italic leading-relaxed">
        <p className="text-caption text-muted-foreground/70">
          케이에이지랩(K-Agelab) &middot; 대표 김용석 &middot; 사업자등록번호 457-24-01157
          <a href={BIZ_INFO_URL} target="_blank" rel="noopener noreferrer" className="ml-2 underline transition-colors hover:text-foreground">
            사업자정보확인
          </a>
        </p>
        <p className="text-caption text-muted-foreground/70">
          통신판매업 제2023-서울서초-2160호 &middot; 서울특별시 노원구 월계로55길 15
        </p>
      </address>
    </footer>
  )
}
