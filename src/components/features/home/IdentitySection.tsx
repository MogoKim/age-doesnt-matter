import Link from 'next/link'

export default function IdentitySection() {
  return (
    <section className="px-4 py-3 bg-primary/5 lg:hidden">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-foreground leading-snug break-keep m-0">
          50·60대 일자리와 따뜻한 수다,{' '}
          우나어에서 만나요
        </p>
        <Link href="/about" className="shrink-0 text-[0.88rem] text-primary font-semibold no-underline min-h-[44px] flex items-center">
          알아보기 →
        </Link>
      </div>
    </section>
  )
}
