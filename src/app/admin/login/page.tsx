import type { Metadata } from 'next'
import AdminLoginForm from '@/components/admin/AdminLoginForm'

export const metadata: Metadata = {
  title: '어드민 로그인',
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">🛠️ 우나어 어드민</h1>
          <p className="mt-2 text-sm text-zinc-500">관리자 계정으로 로그인해 주세요</p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  )
}
