import Link from 'next/link'
import FooterFontSizeToggle from '@/components/common/FooterFontSizeToggle'

// Footer 간소화 v1 — 짧고 조용하게. 법정 고지/약관/개인정보/문의/글씨크기 접근성은 유지.
//  - 제거: 공식 채널(SNS)·Google Play 버튼(FooterChannelLinks), 회사소개·자주 묻는 질문 링크, 상단 브랜드 블록.
//  - 유지: 이용약관/개인정보처리방침/커뮤니티 규칙/문의, 글씨 크기 토글(접근성), 저작권, 사업자정보확인.
//  - 사업자 정보(전자상거래법 제10조): 완전 삭제 금지 → details 접기로 조용하게 유지(펼치면 전체 표시).
const FOOTER_LINKS = [
  { label: '이용약관', href: '/terms', emphasis: false },
  { label: '개인정보처리방침', href: '/privacy', emphasis: true }, // 법정 고지 — 강조 유지
  { label: '커뮤니티 규칙', href: '/rules', emphasis: false },
  { label: '문의', href: '/contact', emphasis: false },
] as const

// 공정거래위원회 통신판매사업자 정보공개 (사업자등록번호 457-24-01157)
const BIZ_INFO_URL = 'https://www.ftc.go.kr/bizCommPop.do?wrkr_no=4572401157'
// 기존 사이트 문의 이메일
const CONTACT_EMAIL = 'korea.age.not.matter@gmail.com'

export default function Footer() {
  return (
    <footer className="w-full bg-background">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 pb-4 lg:pb-6">
        {/* 1. 정책 링크 — 개인정보처리방침만 강조(법정 고지) */}
        <nav className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1.5 py-3" aria-label="하단 링크">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex min-h-11 items-center px-1 py-1.5 text-caption no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ${
                link.emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* 2. 글씨 크기 — 접근성 기능으로 유지(상단 가+와 중복 허용) */}
        <div className="flex w-full justify-center border-t border-border py-3">
          <FooterFontSizeToggle />
        </div>

        {/* 3. 저작권 + 사업자정보(details 접기) — 전자상거래법 제10조: 완전 삭제 없이 조용하게 유지 */}
        <div className="flex w-full flex-col items-center border-t border-border py-3.5">
          {/* 브랜드 한 줄 소개 — "50대 커뮤니티" 검색 신호 보강 (SEO 2026-07-21). 링크·버튼 없음, 조용한 톤 유지 */}
          <p className="mb-1 break-keep text-center text-caption text-muted-foreground">
            40대·50대·60대 여성들이 모여 이야기 나누는 또래 커뮤니티
          </p>
          <p className="text-caption text-muted-foreground/60">&copy; 2026 우리 나이가 어때서</p>
          <details className="mt-1 w-full">
            <summary className="mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center justify-center px-2 text-caption text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              사업자 정보
            </summary>
            <address className="mt-1 text-center not-italic leading-relaxed">
              <p className="text-caption text-muted-foreground/60">
                케이에이지랩(K-Agelab) &middot; 대표 김용석 &middot; 사업자등록번호 457-24-01157
              </p>
              <p className="text-caption text-muted-foreground/60">
                통신판매업 제2023-서울서초-2160호 &middot; 서울특별시 노원구 월계로55길 15
              </p>
              <p className="text-caption text-muted-foreground/60">
                이메일{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline transition-colors hover:text-foreground">
                  {CONTACT_EMAIL}
                </a>
                <a
                  href={BIZ_INFO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 underline transition-colors hover:text-foreground"
                >
                  사업자정보확인
                </a>
              </p>
            </address>
          </details>
        </div>
      </div>
    </footer>
  )
}
