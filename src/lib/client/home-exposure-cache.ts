'use client'

export interface PopupApiData {
  popups?: unknown[]
}

export interface ExposedFeedback {
  eventId: string
  title: string
  description: string | null
}

export interface ExposedSurvey {
  eventId: string
  title: string
  description: string | null
}

export interface BottomPopupExposure {
  feedback: ExposedFeedback | null
  survey: ExposedSurvey | null
}

export interface TodayMine {
  myChoice: 'A' | 'B' | null
}

let homePopupPromise: Promise<PopupApiData> | null = null
let bottomPopupExposurePromise: Promise<BottomPopupExposure> | null = null
let todayMinePromise: Promise<TodayMine> | null = null

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url, { credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`Fetch failed: ${url}`)
    return res.json() as Promise<T>
  })
}

export function getPopupDataForPath(pathname: string): Promise<PopupApiData> {
  const encodedPath = encodeURIComponent(pathname)
  if (pathname !== '/') return fetchJson<PopupApiData>(`/api/popups?path=${encodedPath}`)

  homePopupPromise ??= fetchJson<PopupApiData>('/api/popups?path=%2F').catch(() => ({ popups: [] }))
  return homePopupPromise
}

export async function hasHomeAdminPopupCandidate(): Promise<boolean> {
  const data = await getPopupDataForPath('/')
  return (data.popups?.length ?? 0) > 0
}

export function getBottomPopupExposure(): Promise<BottomPopupExposure> {
  bottomPopupExposurePromise ??= fetchJson<BottomPopupExposure>(
    '/api/events/exposed?channel=bottomPopup',
  ).catch(() => ({ feedback: null, survey: null }))
  return bottomPopupExposurePromise
}

export function getTodayMineOnce(): Promise<TodayMine> {
  todayMinePromise ??= fetchJson<TodayMine>('/api/votes/today/mine').catch(() => ({ myChoice: null }))
  return todayMinePromise
}
