import { NextRequest } from 'next/server'

const BOT_API_KEYS: Record<string, string> = {
  JOB: process.env.BOT_API_KEY_JOB ?? '',
  HUMOR: process.env.BOT_API_KEY_HUMOR ?? '',
  STORY: process.env.BOT_API_KEY_STORY ?? '',
  SEED: process.env.BOT_API_KEY_SEED ?? '',
}

/** 봇 API 인증 — Authorization: Bearer {key} */
export function authenticateBot(req: NextRequest): { ok: boolean; botType?: string; error?: string } {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing Authorization header' }
  }

  const token = authHeader.slice(7)

  for (const [type, key] of Object.entries(BOT_API_KEYS)) {
    if (key && token === key) {
      return { ok: true, botType: type }
    }
  }

  return { ok: false, error: 'Invalid API key' }
}
