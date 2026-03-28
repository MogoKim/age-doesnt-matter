import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? ''
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY ?? ''
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? 'unaeo-uploads'
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? `https://${BUCKET}.r2.cloudflarestorage.com`

if (!ACCOUNT_ID) {
  console.warn('[R2] CLOUDFLARE_ACCOUNT_ID 미설정 — R2 업로드 비활성')
}

const client = ACCOUNT_ID
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
      },
    })
  : null

interface UploadResult {
  key: string
  url: string
}

/**
 * R2에 파일 업로드
 * @param buffer - 파일 데이터
 * @param key - 저장 경로 (예: posts/abc123/image1.webp)
 * @param contentType - MIME 타입
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  if (!client) throw new Error('R2 미설정 — CLOUDFLARE_ACCOUNT_ID 환경변수 필요')

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )

  return {
    key,
    url: `${PUBLIC_URL}/${key}`,
  }
}

/**
 * R2에서 파일 삭제
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!client) throw new Error('R2 미설정 — CLOUDFLARE_ACCOUNT_ID 환경변수 필요')

  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  )
}
