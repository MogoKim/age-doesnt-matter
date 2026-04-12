import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description: '우나어 이용 방법, 등급 안내, 고객 문의 등 자주 묻는 질문 모음',
  alternates: { canonical: 'https://age-doesnt-matter.com/faq' },
}

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children
}
