import Link from 'next/link'
import Image from 'next/image'
import FooterFontSizeToggle from '@/components/common/FooterFontSizeToggle'
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
    // full-width band → 내부 container(max-w-lg)로 분리
    <footer className="w-full bg-background">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 pb-6 lg:pb-8">
        {/* 0. 브랜드 — 로고 심볼(object-cover로 상단 심볼만, 픽셀 crop hack 제거) + 워드마크 + 소개 */}
        <div className="flex flex-col items-center gap-1 py-5">
          <div className="flex items-center gap-1.5">
            <span className="relative block h-6 w-6 shrink-0 overflow-hidden" aria-hidden="true">
              <Image src="/logo-symbol.png" alt="" fill sizes="24px" className="object-cover object-top" />
            </span>
            <span className="text-caption font-extrabold text-primary">우리 나이가 어때서</span>
          </div>
          <span className="text-caption text-muted-foreground/60">50대 60대 여성을 위한 커뮤니티</span>
        </div>

        {/* 1. 정책 링크 */}
        <nav className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 border-t border-border py-3.5" aria-label="하단 링크">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={`inline-flex min-h-11 items-center px-1 py-1.5 text-caption text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary${link.href === '/privacy' ? ' font-bold' : ''}`}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* 2. 공식 채널(SNS) + 3. Google Play (FooterChannelLinks가 자체 구분선 섹션으로 렌더, Play는 웹 전용) */}
        <FooterChannelLinks />

        {/* 4. 글씨 크기 — 컴팩트 알약 그룹 */}
        <div className="flex w-full justify-center border-t border-border py-3.5">
          <FooterFontSizeToggle />
        </div>

        {/* 5. 저작권 + 사업자정보 (전자상거래법 제10조: 전체 항목 표시, 시각만 축소) */}
        <div className="flex w-full flex-col items-center border-t border-border py-4">
          <p className="text-caption font-semibold text-muted-foreground">&copy; 2026 우리 나이가 어때서</p>
          <address className="mt-1.5 text-center not-italic leading-relaxed">
            <p className="text-caption text-muted-foreground/70">
              케이에이지랩(K-Agelab) &middot; 대표 김용석 &middot; 사업자등록번호 457-24-01157
              <a href={BIZ_INFO_URL} target="_blank" rel="noopener noreferrer" className="ml-1.5 underline transition-colors hover:text-foreground">
                사업자정보확인
              </a>
            </p>
            <p className="text-caption text-muted-foreground/70">
              통신판매업 제2023-서울서초-2160호 &middot; 서울특별시 노원구 월계로55길 15
            </p>
          </address>
        </div>
      </div>
    </footer>
  )
}
