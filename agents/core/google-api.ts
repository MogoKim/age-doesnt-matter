/**
 * Google API 클라이언트 — GA4 Data API + Search Console API
 * Service Account 인증 (GOOGLE_SERVICE_ACCOUNT_JSON 환경변수)
 * 환경변수 미설정 시 null 반환 (graceful degradation)
 */

import { google } from 'googleapis'
import type { JWT } from 'google-auth-library'

// ─── 타입 정의 ───────────────────────────────────────────

export interface GA4Report {
  activeUsers: number
  sessions: number
  pageViews: number
  bounceRate: number
  avgSessionDuration: number
  topPages: Array<{ page: string; views: number }>
  topEvents: Array<{ event: string; count: number }>
}

export interface SearchConsoleReport {
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  topQueries: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  topPages: Array<{
    page: string
    clicks: number
    impressions: number
  }>
}

// ─── 인증 ────────────────────────────────────────────────

/**
 * GOOGLE_SERVICE_ACCOUNT_JSON (Base64) 디코딩 → GoogleAuth JWT 생성
 * 환경변수 없으면 null 반환
 */
export function getGoogleAuth(scopes: string[]): JWT | null {
  const base64Json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  if (!base64Json) {
    console.warn('[google-api] GOOGLE_SERVICE_ACCOUNT_JSON 환경변수 미설정 — 건너뜀')
    return null
  }

  try {
    const decoded = Buffer.from(base64Json, 'base64').toString('utf-8')
    const credentials = JSON.parse(decoded) as {
      client_email: string
      private_key: string
      project_id: string
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes,
    })

    return auth
  } catch (err) {
    console.warn('[google-api] Service Account JSON 파싱 실패:', err)
    return null
  }
}

// ─── GA4 Data API ────────────────────────────────────────

/**
 * GA4 Data API v1beta 호출 — 주요 지표 + 인기 페이지 + 인기 이벤트
 * GA4_PROPERTY_ID 환경변수 필요
 */
export async function fetchGA4Report(
  startDate: string,
  endDate: string,
): Promise<GA4Report | null> {
  const propertyId = process.env.GA4_PROPERTY_ID ?? ''
  if (!propertyId) {
    console.warn('[google-api] GA4_PROPERTY_ID 미설정 — GA4 수집 건너뜀')
    return null
  }

  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/analytics.readonly',
  ])
  if (!auth) return null

  try {
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })
    const property = `properties/${propertyId}`

    // 1) 주요 지표 일괄 요청
    const metricsResponse = await analyticsdata.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      },
    })

    const metricValues = metricsResponse.data.rows?.[0]?.metricValues ?? []
    const activeUsers = Number(metricValues[0]?.value ?? '0')
    const sessions = Number(metricValues[1]?.value ?? '0')
    const pageViews = Number(metricValues[2]?.value ?? '0')
    const bounceRate = Number(metricValues[3]?.value ?? '0')
    const avgSessionDuration = Number(metricValues[4]?.value ?? '0')

    // 2) 인기 페이지 Top 10
    const pagesResponse = await analyticsdata.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      },
    })

    const topPages: GA4Report['topPages'] = (pagesResponse.data.rows ?? []).map(
      (row) => ({
        page: row.dimensionValues?.[0]?.value ?? '',
        views: Number(row.metricValues?.[0]?.value ?? '0'),
      }),
    )

    // 3) 인기 이벤트 Top 10
    const eventsResponse = await analyticsdata.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 10,
      },
    })

    const topEvents: GA4Report['topEvents'] = (eventsResponse.data.rows ?? []).map(
      (row) => ({
        event: row.dimensionValues?.[0]?.value ?? '',
        count: Number(row.metricValues?.[0]?.value ?? '0'),
      }),
    )

    return {
      activeUsers,
      sessions,
      pageViews,
      bounceRate,
      avgSessionDuration,
      topPages,
      topEvents,
    }
  } catch (err) {
    console.warn('[google-api] GA4 Data API 호출 실패:', err)
    return null
  }
}

// ─── GA4 Cohort Retention (D7) ──────────────────────────

export interface GA4CohortRetention {
  cohortSize: number        // 기준 주 신규 유저 수
  d7RetentionUsers: number  // 7일 후 재방문 유저 수
  d7RetentionRate: number   // D7 리텐션율 (0.0 ~ 1.0)
  measuredWeek: string      // 측정 기준 주 (ISO, e.g. "2026-03-30")
}

/**
 * GA4 Cohort API — D7 리텐션율 측정
 *
 * 방법: firstSessionDate 기준 코호트 + cohortNthWeek=0001 (1주차 복귀율)
 * = 지난 주에 처음 방문한 유저 중 이번 주에도 재방문한 비율
 *
 * KR3 OKR 측정용: D7 리텐션 목표 25%
 */
export async function fetchGA4CohortRetention(): Promise<GA4CohortRetention | null> {
  const propertyId = process.env.GA4_PROPERTY_ID ?? ''
  if (!propertyId) {
    console.warn('[google-api] GA4_PROPERTY_ID 미설정 — Cohort 수집 건너뜀')
    return null
  }

  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/analytics.readonly',
  ])
  if (!auth) return null

  try {
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })
    const property = `properties/${propertyId}`

    // 지난 주 (7~13일 전): 코호트 정의 기간
    const cohortStart = new Date(Date.now() - 13 * 86400000).toISOString().split('T')[0]
    const cohortEnd = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const response = await analyticsdata.properties.runReport({
      property,
      requestBody: {
        cohortSpec: {
          cohorts: [
            {
              name: 'week_cohort',
              dimension: 'firstSessionDate',
              dateRange: { startDate: cohortStart, endDate: cohortEnd },
            },
          ],
          cohortsRange: {
            granularity: 'WEEKLY',
            startOffset: 0,
            endOffset: 1,
          },
        },
        dimensions: [{ name: 'cohort' }, { name: 'cohortNthWeek' }],
        metrics: [{ name: 'cohortActiveUsers' }],
      },
    })

    const rows = response.data.rows ?? []

    // cohortNthWeek=0000 → 코호트 기준 주 (전체 규모)
    // cohortNthWeek=0001 → 1주차 복귀 유저 (D7 리텐션)
    let cohortSize = 0
    let d7RetentionUsers = 0

    for (const row of rows) {
      const week = row.dimensionValues?.[1]?.value ?? ''
      const users = Number(row.metricValues?.[0]?.value ?? '0')
      if (week === '0000') cohortSize = users
      if (week === '0001') d7RetentionUsers = users
    }

    const d7RetentionRate = cohortSize > 0 ? d7RetentionUsers / cohortSize : 0

    return {
      cohortSize,
      d7RetentionUsers,
      d7RetentionRate,
      measuredWeek: cohortStart,
    }
  } catch (err) {
    console.warn('[google-api] GA4 Cohort API 호출 실패:', err)
    return null
  }
}

// ─── Search Console API ──────────────────────────────────

/**
 * Search Console API v1 호출 — 검색 성과 + 인기 쿼리 + 인기 페이지
 * SEARCH_CONSOLE_SITE_URL 환경변수 필요
 */
export async function fetchSearchConsoleReport(
  startDate: string,
  endDate: string,
): Promise<SearchConsoleReport | null> {
  const siteUrl =
    process.env.SEARCH_CONSOLE_SITE_URL ?? 'https://age-doesnt-matter.com'
  if (!process.env.SEARCH_CONSOLE_SITE_URL) {
    console.warn('[google-api] SEARCH_CONSOLE_SITE_URL 미설정 — SC 수집 건너뜀')
    return null
  }

  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/webmasters.readonly',
  ])
  if (!auth) return null

  try {
    const searchconsole = google.searchconsole({ version: 'v1', auth })

    // 1) 전체 합산 (dimension 없이)
    const totalResponse = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: [],
      },
    })

    const totalRows = totalResponse.data.rows ?? []
    const totalClicks = totalRows.reduce((sum, r) => sum + (r.clicks ?? 0), 0)
    const totalImpressions = totalRows.reduce(
      (sum, r) => sum + (r.impressions ?? 0),
      0,
    )
    const avgCtr =
      totalImpressions > 0 ? totalClicks / totalImpressions : 0
    const avgPosition =
      totalRows.length > 0
        ? totalRows.reduce((sum, r) => sum + (r.position ?? 0), 0) /
          totalRows.length
        : 0

    // 2) 인기 쿼리 Top 20
    const queryResponse = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 20,
      },
    })

    const topQueries: SearchConsoleReport['topQueries'] = (
      queryResponse.data.rows ?? []
    ).map((row) => ({
      query: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }))

    // 3) 인기 페이지 Top 20
    const pageResponse = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: 20,
      },
    })

    const topPages: SearchConsoleReport['topPages'] = (
      pageResponse.data.rows ?? []
    ).map((row) => ({
      page: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
    }))

    return {
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      topQueries,
      topPages,
    }
  } catch (err) {
    console.warn('[google-api] Search Console API 호출 실패:', err)
    return null
  }
}
