'use server'

export async function verifyTurnstile(token: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true

  const secret = process.env.CF_TURNSTILE_SECRET_KEY
  if (!secret) return false

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    if (!res.ok) return false
    const data = await res.json() as { success: boolean }
    return data.success === true
  } catch {
    return false
  }
}
