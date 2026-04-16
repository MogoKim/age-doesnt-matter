import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '문의',
  description: '우나어에 문의하기',
  alternates: { canonical: 'https://age-doesnt-matter.com/contact' },
}

export default function ContactPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8">문의하기</h1>

      <div className="space-y-6">
        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-body font-bold text-foreground mb-3">서비스 관련 문의</h2>
          <p className="text-body text-muted-foreground leading-relaxed break-keep mb-4">
            서비스 이용 중 불편한 점이나 궁금한 점이 있으시면 아래 이메일로 문의해 주세요.
          </p>
          <a
            href="mailto:korea.age.not.matter@gmail.com"
            className="inline-flex items-center gap-2 text-body text-primary font-medium no-underline min-h-[52px]"
          >
            📧 korea.age.not.matter@gmail.com
          </a>
        </section>

        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-body font-bold text-foreground mb-3">제휴·광고 문의</h2>
          <p className="text-body text-muted-foreground leading-relaxed break-keep mb-4">
            제휴, 광고, 협업 관련 문의는 아래 이메일로 보내주세요.
          </p>
          <a
            href="mailto:korea.age.not.matter@gmail.com"
            className="inline-flex items-center gap-2 text-body text-primary font-medium no-underline min-h-[52px]"
          >
            📧 korea.age.not.matter@gmail.com
          </a>
        </section>

        <section className="bg-card rounded-2xl p-6 border border-border">
          <h2 className="text-body font-bold text-foreground mb-3">운영 시간</h2>
          <div className="space-y-2 text-body text-muted-foreground">
            <p className="m-0">평일 오전 10시 ~ 오후 6시</p>
            <p className="m-0">주말·공휴일 휴무</p>
            <p className="m-0 text-sm">문의 접수 후 영업일 기준 1~2일 내 답변드려요.</p>
          </div>
        </section>

        <div className="pt-4">
          <p className="text-sm text-muted-foreground">
            커뮤니티 이용 관련은{' '}
            <Link href="/terms" className="text-primary no-underline font-medium">
              이용약관
            </Link>
            과{' '}
            <Link href="/privacy" className="text-primary no-underline font-medium">
              개인정보처리방침
            </Link>
            을 참고해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
