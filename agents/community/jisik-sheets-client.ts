/**
 * Google Sheets 클라이언트 — 지식인 자동 답변 전용
 * 기존 google-api.ts의 getGoogleAuth() 재사용
 *
 * 시트 구조 (탭: "답변 관리"):
 *   A: 질문 URL
 *   B: 상태 (Ready/Processing/Answered/Error/Skip)
 *   C: 카테고리 (건강/취업/재테크/가족/생활/기타)
 *   D: 질문 요약 (자동 채움)
 *   E: AI 답변 (자동 채움)
 *   F: 답변 URL (자동 채움)
 *   G: 오류 내용 (자동 채움)
 *   H: 처리일시 (자동 채움)
 *   I: 메모 (창업자 입력)
 */

import { google } from 'googleapis'
import { getGoogleAuth } from '../core/google-api.js'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
const TAB_NAME = '답변 관리'
const MAX_READY_ROWS = 3

export interface JisikRow {
  rowIndex: number // 1-based (헤더 = 1, 첫 데이터 = 2)
  url: string
  status: string
  category: string
  questionSummary: string
  answer: string
  answerUrl: string
  error: string
  processedAt: string
  note: string
}

function getSheetId(): string {
  const id = process.env.JISIK_SHEETS_ID
  if (!id) throw new Error('JISIK_SHEETS_ID 환경변수 미설정')
  return id
}

function getSheets() {
  const auth = getGoogleAuth(SCOPES)
  if (!auth) throw new Error('Google Service Account 인증 실패')
  return google.sheets({ version: 'v4', auth })
}

/**
 * "답변 관리" 탭에서 Ready 상태 행 읽기 (최대 MAX_READY_ROWS개)
 */
export async function readReadyRows(): Promise<JisikRow[]> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB_NAME}!A:I`,
  })

  const rawRows = res.data.values ?? []
  if (rawRows.length <= 1) return []

  const rows: JisikRow[] = []
  for (let i = 1; i < rawRows.length; i++) {
    if (rows.length >= MAX_READY_ROWS) break

    const r = rawRows[i]
    const url = (r[0] ?? '').trim()
    if (!url) continue

    const status = (r[1] ?? '').trim()
    if (status.toLowerCase() !== 'ready') continue

    rows.push({
      rowIndex: i + 1, // 1-based
      url,
      status,
      category: (r[2] ?? '').trim(),
      questionSummary: (r[3] ?? '').trim(),
      answer: (r[4] ?? '').trim(),
      answerUrl: (r[5] ?? '').trim(),
      error: (r[6] ?? '').trim(),
      processedAt: (r[7] ?? '').trim(),
      note: (r[8] ?? '').trim(),
    })
  }

  return rows
}

/**
 * B열 상태 업데이트
 */
export async function updateStatus(rowIndex: number, status: string): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${TAB_NAME}!B${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  })
}

/**
 * 답변 성공 시 일괄 업데이트 (B/D/E/F/H열)
 */
export async function updateAnswered(
  rowIndex: number,
  questionSummary: string,
  answer: string,
  answerUrl: string,
): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()
  const processedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  const batchData = [
    { range: `${TAB_NAME}!B${rowIndex}`, values: [['Answered']] },
    { range: `${TAB_NAME}!D${rowIndex}`, values: [[questionSummary]] },
    { range: `${TAB_NAME}!E${rowIndex}`, values: [[answer]] },
    { range: `${TAB_NAME}!F${rowIndex}`, values: [[answerUrl]] },
    { range: `${TAB_NAME}!H${rowIndex}`, values: [[processedAt]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: batchData,
    },
  })
}

/**
 * 오류 시 업데이트 (B/G/H열)
 */
export async function updateError(rowIndex: number, errorMsg: string): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()
  const processedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  const batchData = [
    { range: `${TAB_NAME}!B${rowIndex}`, values: [['Error']] },
    { range: `${TAB_NAME}!G${rowIndex}`, values: [[errorMsg]] },
    { range: `${TAB_NAME}!H${rowIndex}`, values: [[processedAt]] },
  ]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: batchData,
    },
  })
}

/**
 * 카테고리 업데이트 (C열 — 자동 감지 결과)
 */
export async function updateCategory(rowIndex: number, category: string): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${TAB_NAME}!C${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[category]] },
  })
}

/**
 * 시트 초기화 — 헤더/색상/드롭다운/freeze 설정 (최초 1회 실행)
 * 사용법: INIT_SHEET=1 npx tsx agents/community/jisik-sheets-client.ts
 */
export async function initSheet(): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = getSheetId()

  // 0. 탭 존재 여부 확인 후 없으면 생성
  const metaCheck = await sheets.spreadsheets.get({ spreadsheetId })
  const tabExists = metaCheck.data.sheets?.some((s) => s.properties?.title === TAB_NAME)
  if (!tabExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
    })
    console.log(`[JisikSheets] "${TAB_NAME}" 탭 생성 완료`)
  }

  // 1. 헤더 값 작성
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['질문 URL', '상태', '카테고리', '질문 요약', 'AI 답변', '답변 URL', '오류', '처리일시', '메모']],
    },
  })

  // 시트 ID 조회
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === TAB_NAME)
  const sheetId = sheet?.properties?.sheetId ?? 0

  // 2. 서식 요청 (헤더 스타일 + freeze + 열 너비 + 드롭다운 + 조건부 서식)
  const requests = [
    // 헤더 행 스타일 (진한 배경 + 흰 글씨 + bold)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.176, green: 0.176, blue: 0.176 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // 1행 freeze
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // 열 너비 최적화
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 320 }, fields: 'pixelSize' } }, // A: URL
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // B: 상태
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // C: 카테고리
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } }, // D: 질문 요약
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 400 }, fields: 'pixelSize' } }, // E: AI 답변
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 280 }, fields: 'pixelSize' } }, // F: 답변 URL
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } }, // G: 오류
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } }, // H: 처리일시
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } }, // I: 메모
    // D/E열 텍스트 줄바꿈
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 3, endColumnIndex: 5 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy',
      },
    },
    // B열 드롭다운 (상태)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: 'Ready' },
              { userEnteredValue: 'Processing' },
              { userEnteredValue: 'Answered' },
              { userEnteredValue: 'Error' },
              { userEnteredValue: 'Skip' },
            ],
          },
          showCustomUi: true,
        },
      },
    },
    // C열 드롭다운 (카테고리)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: '건강' },
              { userEnteredValue: '취업' },
              { userEnteredValue: '재테크' },
              { userEnteredValue: '가족' },
              { userEnteredValue: '생활' },
              { userEnteredValue: '기타' },
            ],
          },
          showCustomUi: true,
        },
      },
    },
    // 조건부 서식 — Ready (노란)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 9 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Ready' }] },
            format: { backgroundColor: { red: 1, green: 0.949, blue: 0.8 } },
          },
        },
        index: 0,
      },
    },
    // 조건부 서식 — Processing (파란)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 9 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Processing' }] },
            format: { backgroundColor: { red: 0.812, green: 0.886, blue: 1 } },
          },
        },
        index: 1,
      },
    },
    // 조건부 서식 — Answered (초록)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 9 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Answered' }] },
            format: { backgroundColor: { red: 0.831, green: 0.929, blue: 0.827 } },
          },
        },
        index: 2,
      },
    },
    // 조건부 서식 — Error (빨간)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 9 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Error' }] },
            format: { backgroundColor: { red: 0.973, green: 0.843, blue: 0.843 } },
          },
        },
        index: 3,
      },
    },
    // 조건부 서식 — Skip (회색)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 9 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Skip' }] },
            format: { backgroundColor: { red: 0.886, green: 0.886, blue: 0.894 } },
          },
        },
        index: 4,
      },
    },
  ]

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })

  console.log('[JisikSheets] ✅ 시트 초기화 완료')
}

// 직접 실행 시 시트 초기화
if (process.env.INIT_SHEET === '1') {
  initSheet()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1) })
}
