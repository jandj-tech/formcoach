import { put, del } from '@vercel/blob'

// Single seam for object storage (uploaded videos + extracted frames).
//
// Every route goes through putObject/deleteObjects instead of importing
// @vercel/blob directly, so moving off Vercel is a one-file change: implement
// the 's3' branch below and set STORAGE_DRIVER=s3. See MIGRATION.md for the
// Cloudflare R2 driver (ready to paste) and the env vars it needs.
//
// NOTE: the browser direct-upload flow in app/api/upload-video/route.ts uses
// @vercel/blob/client's handleUpload and is NOT covered by this seam — it needs
// a provider-specific presigned-upload rewrite, also documented in MIGRATION.md.

const DRIVER = process.env.STORAGE_DRIVER || 'vercel'

export type PutResult = { url: string }

const notImplemented = (): never => {
  throw new Error(
    `STORAGE_DRIVER="${DRIVER}" has no implementation yet. See MIGRATION.md to add the R2/S3 driver.`,
  )
}

export async function putObject(
  key: string,
  data: Buffer | Blob | string,
  opts?: { contentType?: string },
): Promise<PutResult> {
  if (DRIVER === 'vercel') {
    const blob = await put(key, data, {
      access: 'public',
      contentType: opts?.contentType,
    })
    return { url: blob.url }
  }
  return notImplemented()
}

export async function deleteObjects(urls: string | string[]): Promise<void> {
  if (DRIVER === 'vercel') {
    await del(urls)
    return
  }
  notImplemented()
}

export function storageDriver(): string {
  return DRIVER
}
