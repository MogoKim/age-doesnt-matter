'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { adminLogin } from '@/lib/actions/admin-auth'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? '로그인 중...' : '로그인'}
    </button>
  )
}

export default function AdminLoginForm() {
  const [state, formAction] = useFormState(adminLogin, null)

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-600">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[15px] font-medium text-zinc-700">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-12 w-full rounded-lg border border-zinc-300 px-3 text-[15px] text-zinc-900 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          placeholder="admin@age-doesnt-matter.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[15px] font-medium text-zinc-700">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-12 w-full rounded-lg border border-zinc-300 px-3 text-[15px] text-zinc-900 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          placeholder="••••••••"
        />
      </div>

      <SubmitButton />
    </form>
  )
}
