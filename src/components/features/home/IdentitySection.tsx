import Link from 'next/link'

export default function IdentitySection() {
  return (
    <section className="px-4 py-6 bg-primary/5 border-b border-primary/15 lg:hidden">
      <p className="text-base font-semibold text-foreground leading-relaxed break-keep mb-4">
        50·60대 일자리와 따뜻한 수다,
        <br />
        우나어에서 만나요
      </p>
      <Link href="/about" className="inline-flex items-center gap-1.5 text-[15px] text-primary font-semibold no-underline py-2 min-h-[44px]">
        처음이신가요? 우나어 알아보기 →
      </Link>
    </section>
  )
}
