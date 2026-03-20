'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'

  async function handleKakaoLogin() {
    const res = await fetch('/api/auth/csrf')
    const { csrfToken } = await res.json()

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/signin/kakao'

    const csrfInput = document.createElement('input')
    csrfInput.type = 'hidden'
    csrfInput.name = 'csrfToken'
    csrfInput.value = csrfToken

    const callbackInput = document.createElement('input')
    callbackInput.type = 'hidden'
    callbackInput.name = 'callbackUrl'
    callbackInput.value = callbackUrl

    form.appendChild(csrfInput)
    form.appendChild(callbackInput)
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <div className="w-full max-w-[420px] bg-card rounded-2xl p-12 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] text-center max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col max-md:justify-center">
      {/* \uB85C\uACE0 */}
      <div className="mb-8">
        <span className="text-6xl block mb-4">\uD83D\uDFE0</span>
        <h1 className="text-2xl font-bold text-foreground mb-1">\uC6B0\uB9AC \uB098\uC774\uAC00 \uC5B4\uB54C\uC11C</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          \uB098\uC774 \uAC71\uC815 \uC5C6\uC774 \uC18C\uD1B5\uD558\uB294<br />
          \uB530\uB73B\uD55C \uCEE4\uBBA4\uB2C8\uD2F0
        </p>
      </div>

      {/* \uCE74\uCE74\uC624 \uB85C\uADF8\uC778 \uBC84\uD2BC */}
      <button
        className="flex items-center justify-center gap-2 w-full h-[52px] px-6 border-none rounded-xl bg-[#FEE500] text-[#191919] text-sm font-bold cursor-pointer transition-all shadow-[0_2px_8px_rgba(254,229,0,0.3)] mb-6 hover:bg-[#F5DC00] hover:shadow-[0_4px_14px_rgba(254,229,0,0.4)] hover:-translate-y-0.5 active:translate-y-0"
        onClick={handleKakaoLogin}
        type="button"
      >
        <span className="text-[22px] shrink-0">\uD83D\uDCAC</span>
        \uCE74\uCE74\uC624\uB85C \uC2DC\uC791\uD558\uAE30
      </button>

      {/* \uC548\uB0B4 \uBB38\uAD6C */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        \uB85C\uADF8\uC778 \uC2DC{' '}
        <Link href="/terms/service" className="text-muted-foreground underline hover:text-primary">\uC774\uC6A9\uC57D\uAD00</Link>
        {' '}\uBC0F{' '}
        <Link href="/terms/privacy" className="text-muted-foreground underline hover:text-primary">\uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68</Link>
        \uC5D0 \uB3D9\uC758\uD558\uAC8C \uB429\uB2C8\uB2E4.
      </p>

      {/* \uBE44\uD68C\uC6D0 \uB458\uB7EC\uBCF4\uAE30 */}
      <Link
        href="/"
        className="inline-flex items-center min-h-[52px] px-4 mt-4 text-xs font-medium text-muted-foreground rounded-lg transition-colors hover:text-primary"
      >
        \uBE44\uD68C\uC6D0\uC73C\uB85C \uB458\uB7EC\uBCF4\uAE30 \u2192
      </Link>
    </div>
  )
}
