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
  boardType: 'STORY' | 'HUMOR'
  rows: SheetRow[]
}

const TAB_TO_BOARD: Record<string, 'STORY' | 'HUMOR'> = {
  '사는이야기': 'STORY',
  '웃음방': 'HUMOR',
  '활력충전소': 'HUMOR',  // 하위 호환 (시트 탭명이 아직 구명일 경우)
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
 * 두 탭(사는이야기/웃음방)에서 PENDING 행 읽기
 */
export async function readPendingRows(): Promise<SheetTab[]> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()
  const tabs: SheetTab[] = []

  for (const [tabName, boardType] of Object.entries(TAB_TO_BOARD)) {
    const range = `${tabName}!A:J`
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    const rawRows = res.data.values ?? []

    if (rawRows.length <= 1) continue // 헤더만 있거나 비어있음

    const rows: SheetRow[] = []
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i]
      const sourceUrl = (r[0] ?? '').trim()
      if (!sourceUrl) continue

      const status = (r[1] ?? '').trim().toUpperCase() || 'PENDING'

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
      tabs.push({ tabName, boardType, rows })
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
