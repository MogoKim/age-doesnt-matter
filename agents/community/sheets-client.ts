/**
 * Google Sheets API 클라이언트 — 스크래퍼 시트 읽기/쓰기
 * 기존 google-api.ts의 getGoogleAuth() 재사용
 */

import { google } from 'googleapis'
import { getGoogleAuth } from '../core/google-api.js'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

/** 시트 행 데이터 */
export interface SheetRow {
  rowIndex: number // 1-based (헤더 = 1, 첫 데이터 = 2)
  sourceUrl: string
  status: string
  title: string
  category: string
  persona: string
  postUrl: string
  error: string
  publishedAt: string
  note: string
  rawContent: string
}

/** 시트 탭 정보 */
export interface SheetTab {
  tabName: string
  boardType: 'STORY' | 'HUMOR' | 'LIFE2'
  isFeatured: boolean  // _화제성 탭: 즉각 HOT 파이프라인 발동
  rows: SheetRow[]
}

const TAB_TO_BOARD: Record<string, { boardType: 'STORY' | 'HUMOR' | 'LIFE2'; isFeatured: boolean }> = {
  '사는이야기': { boardType: 'STORY', isFeatured: false },
  '웃음방': { boardType: 'HUMOR', isFeatured: false },
  '사는이야기_화제성': { boardType: 'STORY', isFeatured: true },
  '웃음방_화제성': { boardType: 'HUMOR', isFeatured: true },
  '2막준비': { boardType: 'LIFE2', isFeatured: false },
  '2막준비_화제성': { boardType: 'LIFE2', isFeatured: true },
}

function getSheetId(): string {
  const id = process.env.SHEETS_SCRAPER_ID
  if (!id) throw new Error('SHEETS_SCRAPER_ID 환경변수 미설정')
  return id
}

function getSheets() {
  const auth = getGoogleAuth(SCOPES)
  if (!auth) throw new Error('Google Service Account 인증 실패')
  return google.sheets({ version: 'v4', auth })
}

/**
 * 탭(사는이야기/웃음방/2막준비 등)에서 PENDING 행 읽기
 * 탭이 Sheet에 아직 없으면 warning 후 skip (GHA 실패 방지)
 */
export async function readPendingRows(): Promise<SheetTab[]> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()
  const tabs: SheetTab[] = []

  for (const [tabName, { boardType, isFeatured }] of Object.entries(TAB_TO_BOARD)) {
    const range = `${tabName}!A:J`
    let res
    try {
      res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Unable to parse range') || msg.includes('does not exist')) {
        console.warn(`[sheets] 탭 없음, 스킵: ${tabName}`)
        continue
      }
      throw err
    }
    const rawRows = res.data.values ?? []

    if (rawRows.length <= 1) continue // 헤더만 있거나 비어있음

    const rows: SheetRow[] = []
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i]
      const sourceUrl = (r[0] ?? '').trim()
      if (!sourceUrl) continue

      const rawStatus = (r[1] ?? '').trim().toUpperCase() || 'PENDING'
      // 알려진 상태값이 아니면(예: 외부 요인으로 B칸에 URL/쓰레기값 유입) PENDING으로 간주 — 영구 스킵 방지(자가복구)
      const KNOWN_STATUS = ['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'SKIPPED', 'SKIP', 'PARTIAL', 'HOLD']
      const status = KNOWN_STATUS.includes(rawStatus) ? rawStatus : 'PENDING'
      if (status !== rawStatus) {
        console.warn(`[sheets] 행 ${i + 1} status 비정상("${(r[1] ?? '').slice(0, 40)}") → PENDING 처리`)
      }

      if (status === 'PENDING') {
        rows.push({
          rowIndex: i + 1, // 1-based (헤더=1)
          sourceUrl,
          status,
          title: (r[2] ?? '').trim(),
          category: (r[3] ?? '').trim(),
          persona: (r[4] ?? '').trim(),
          postUrl: (r[5] ?? '').trim(),
          error: (r[6] ?? '').trim(),
          publishedAt: (r[7] ?? '').trim(),
          note: (r[8] ?? '').trim(),
          rawContent: (r[9] ?? '').trim(),
        })
      }
    }

    if (rows.length > 0) {
      tabs.push({ tabName, boardType, isFeatured, rows })
    }
  }

  return tabs
}

/**
 * 시트 셀 업데이트 (단일)
 */
export async function updateCell(
  tabName: string,
  rowIndex: number,
  column: string,
  value: string,
): Promise<void> {
  const sheets = getSheets()
  const range = `${tabName}!${column}${rowIndex}`
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

/**
 * 한 행의 여러 컬럼을 한 번에 업데이트
 */
export async function updateRow(
  tabName: string,
  rowIndex: number,
  updates: {
    status?: string
    title?: string
    category?: string
    persona?: string
    postUrl?: string
    error?: string
    publishedAt?: string
  },
): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()

  const data: Array<{ range: string; values: string[][] }> = []

  if (updates.status !== undefined)
    data.push({ range: `${tabName}!B${rowIndex}`, values: [[updates.status]] })
  if (updates.title !== undefined)
    data.push({ range: `${tabName}!C${rowIndex}`, values: [[updates.title]] })
  if (updates.category !== undefined)
    data.push({ range: `${tabName}!D${rowIndex}`, values: [[updates.category]] })
  if (updates.persona !== undefined)
    data.push({ range: `${tabName}!E${rowIndex}`, values: [[updates.persona]] })
  if (updates.postUrl !== undefined)
    data.push({ range: `${tabName}!F${rowIndex}`, values: [[updates.postUrl]] })
  if (updates.error !== undefined)
    data.push({ range: `${tabName}!G${rowIndex}`, values: [[updates.error]] })
  if (updates.publishedAt !== undefined)
    data.push({ range: `${tabName}!H${rowIndex}`, values: [[updates.publishedAt]] })

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data,
      },
    })
  }
}

/**
 * 전 탭 A열 URL 집합 반환 (상태 무관 — PENDING/PUBLISHED/FAILED 전부)
 * image-router dedup 전용. readPendingRows()는 PENDING만 반환하므로 사용 불가.
 * 탭 없음(범위 오류)만 스킵 — 인증/API 실패는 throw → append 전체 차단
 */
export async function readAllSheetUrls(): Promise<Set<string>> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()
  const urlSet = new Set<string>()
  for (const tabName of Object.keys(TAB_TO_BOARD)) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:A`,
      })
      for (const row of res.data.values ?? []) {
        const url = ((row[0] as string | undefined) ?? '').trim()
        if (url.startsWith('http')) urlSet.add(url)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Unable to parse range') || msg.includes('does not exist') || msg.includes('notFound')) {
        console.warn(`[sheets] 탭 없음, 스킵: ${tabName}`)
        continue
      }
      throw err
    }
  }
  return urlSet
}

/**
 * 전 탭 PENDING 행 총 수 (readPendingRows 재사용 — backlog cap 체크용)
 */
export async function countPendingTotal(): Promise<number> {
  const tabs = await readPendingRows()
  return tabs.reduce((sum, t) => sum + t.rows.length, 0)
}

/**
 * 탭에 새 행 append (image-router 전용)
 * J열 rawContent 반드시 빈 문자열 — 비워야 scraper 자동 스크래핑 모드 동작
 */
export async function appendRow(tabName: string, sourceUrl: string, note?: string): Promise<void> {
  const sheets = getSheets()
  // A:sourceUrl B:PENDING C~H:빈칸 I:note J:rawContent=빈 문자열(필수)
  const values = [[sourceUrl, 'PENDING', '', '', '', '', '', '', note ?? '', '']]
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${tabName}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
}
