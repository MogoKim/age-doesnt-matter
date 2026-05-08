import Link from 'next/link'

export default function IdentitySection() {
  return (
    <section className="px-4 py-3 bg-primary/5 lg:hidden">
      <div className="flex items-center justify-between">
        <p className="text-body font-semibold text-foreground leading-snug break-keep m-0">
          5060, 서로를 잇다 —{' '}
          50·60대의 이야기가 여기 다 있어요
        </p>
        <Link href="/about" className="shrink-0 text-caption text-primary-text font-semibold no-underline min-h-[44px] flex items-center">
          알아보기 →
        </Link>
      </div>
    </section>
  )
}
