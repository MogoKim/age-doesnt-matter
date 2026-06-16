import { getExperiment } from './registry'

/**
 * 실험 variant 결정론적 배정 (클라이언트 전용).
 * - _uid(디바이스 고유 ID) 해시 기반 → 재방문 시 동일 variant 불변
 * - 가중치 누적 분배 → variant 비율 반영
 * - localStorage 캐시(검증 가능) — legacyStorageKey 있으면 기존 키 재사용(진행중 실험 보존)
 */
function getDeviceUid(): string {
  let uid = localStorage.getItem('_uid')
  if (!uid) {
    uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem('_uid', uid)
    // 최초 생성 시각 기록 — 신규 사용자 판별용(기존 _uid 사용자는 이 값이 없음)
    if (!localStorage.getItem('_uid_at')) localStorage.setItem('_uid_at', String(Date.now()))
  }
  return uid
}

/**
 * 디바이스 최초 인식 시각(ms). 기존 사용자(_uid_at 없음)는 null.
 * 실험 시작일 이후 첫 방문(신규)만 게이트 대상으로 거를 때 사용.
 */
export function getDeviceFirstSeen(): number | null {
  if (typeof window === 'undefined') return null
  const at = localStorage.getItem('_uid_at')
  return at ? Number.parseInt(at, 10) : null
}

// djb2 해시 — charCode 단순합(중심극한정리로 평균 몰림)을 곱셈 혼합으로 교체해 균등 분포(5:5 배정) 보장.
// >>> 0 으로 unsigned 32bit 유지.
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h
}

export function getExperimentVariant(experimentId: string): string {
  if (typeof window === 'undefined') return ''
  const exp = getExperiment(experimentId)
  if (!exp || exp.variants.length === 0) return ''

  // 시작 시각 게이트 — stored variant(localStorage 캐시) 읽기보다 **가장 먼저** 적용.
  // 시작 전(now < startsAt)에는 기존 exp 캐시가 있어도 배정/노출/렌더가 일어나지 않게 빈 문자열 반환.
  if (exp.startsAt && Date.now() < exp.startsAt) return ''

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
