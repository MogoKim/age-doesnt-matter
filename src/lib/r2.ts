import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET = process.env.R2_BUCKET ?? 'unae-uploads'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? `https://${R2_BUCKET}.r2.cloudflarestorage.com`

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

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
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )

  return {
    key,
    url: `${R2_PUBLIC_URL}/${key}`,
  }
}

/**
 * R2에서 파일 삭제
 */
export async function deleteFromR2(key: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }),
  )
}
