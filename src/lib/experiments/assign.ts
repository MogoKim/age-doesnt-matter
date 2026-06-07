import { getExperiment } from './registry'

/**
 * 실험 variant 결정론적 배정 (클라이언트 전용).
 * - _uid(디바이스 고유 ID) 해시 기반 → 재방문 시 동일 variant 불변
 * - 가중치 누적 분배 → variant 비율 반영
 * - localStorage 캐시(검증 가능) — legacyStorageKey 있으면 기존 키 재사용(진행중 실험 보존)
 *
 * 기존 SignupPromptBanner의 getOrAssignVariant(hash%3)·getTriggerVariant((hash+7)%2)와
 * 동등(가중치 1/1/1 분배 = hash%3, hashOffset=7 = (hash+7)%2).
 */
function getDeviceUid(): string {
  let uid = localStorage.getItem('_uid')
  if (!uid) {
    uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem('_uid', uid)
  }
  return uid
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i)
  return h
}

export function getExperimentVariant(experimentId: string): string {
  if (typeof window === 'undefined') return ''
  const exp = getExperiment(experimentId)
  if (!exp || exp.variants.length === 0) return ''

  const storageKey = exp.legacyStorageKey ?? `exp_${experimentId}`
  const stored = localStorage.getItem(storageKey)
  if (stored && exp.variants.some((v) => v.key === stored)) return stored

  const hash = hashString(getDeviceUid()) + (exp.hashOffset ?? 0)
  const total = exp.variants.reduce((s, v) => s + v.weight, 0)
  let bucket = hash % total
  let chosen = exp.variants[0]!.key
  for (const v of exp.variants) {
    if (bucket < v.weight) {
      chosen = v.key
      break
    }
    bucket -= v.weight
  }
  localStorage.setItem(storageKey, chosen)
  return chosen
}
