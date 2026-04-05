import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Vercel 환경변수 trailing whitespace/newline 제거 (ERR_INVALID_CHAR 방지)
const ACCOUNT_ID = (process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim()
const ACCESS_KEY = (process.env.CLOUDFLARE_R2_ACCESS_KEY ?? '').trim()
const SECRET_KEY = (process.env.CLOUDFLARE_R2_SECRET_KEY ?? '').trim()
const BUCKET = (process.env.CLOUDFLARE_R2_BUCKET ?? 'unaeo-uploads').trim()
const PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? `https://${BUCKET}.r2.cloudflarestorage.com`).trim()

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
 * R2 Pre-signed PUT URL 생성 (대용량 파일 클라이언트 직접 업로드용)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (!client) throw new Error('R2 미설정 — CLOUDFLARE_ACCOUNT_ID 환경변수 필요')

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn })
  return { uploadUrl, publicUrl: `${PUBLIC_URL}/${key}` }
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
