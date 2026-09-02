import { put, del } from '@vercel/blob'
import { resolveBaseUrl } from '@/lib/base-url'

// Single seam for object storage (uploaded videos + extracted frames).
//
// Every route goes through putObject/deleteObjects instead of importing
// @vercel/blob directly, so the storage backend is chosen by STORAGE_DRIVER:
//   - 'vercel' (default): Vercel Blob — used on the Vercel rollback deploy.
//   - 's3': any S3-compatible store; configured for Cloudflare R2. See
//     MIGRATION.md for the env vars.
//
// In the 's3' driver the bucket stays PRIVATE. Objects are read back through
// the app's own /api/media/[...key] proxy, so the "public" URL we return and
// store is `${S3_PUBLIC_BASE_URL}/<key>` where S3_PUBLIC_BASE_URL points at
// that proxy (e.g. https://www.learnhoops.com/api/media). No public bucket,
// no extra DNS.
//
// The browser direct-upload flow in app/api/upload-video/route.ts is the one
// piece not covered by this seam (it mints an upload token/URL); it branches on
// STORAGE_DRIVER the same way.

import type { S3Client } from '@aws-sdk/client-s3'

const DRIVER = process.env.STORAGE_DRIVER || 'vercel'

export type PutResult = { url: string }

// --- S3 (Cloudflare R2) driver ------------------------------------------------

let _s3: S3Client | null = null

// Built lazily so the SDK is only constructed when the s3 driver is actually
// used, and so a Vercel deploy that never sets these env vars doesn't throw.
//
// One client for the whole process. An S3Client owns an https.Agent whose
// keep-alive sockets each hold a file descriptor open for ~2 minutes; building
// a fresh client per request (as the /api/media proxy used to) never reuses or
// destroys those agents, so under real traffic the open FDs pile up faster than
// they're reclaimed and the host runs out — the "opening files and never
// closing them" crash. Sharing this singleton bounds the sockets to one pool.
// See aws/aws-sdk-js-v3 #3279 and #4345.
export async function s3Client(): Promise<S3Client> {
  if (_s3) return _s3
  const { S3Client } = await import('@aws-sdk/client-s3')
  _s3 = new S3Client({
    region: 'auto',
    endpoint: requireEnv('S3_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  })
  return _s3
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (required for STORAGE_DRIVER=s3)`)
  return v
}

export function s3Bucket(): string {
  return requireEnv('S3_BUCKET')
}

// Public base is the /api/media proxy origin, with no trailing slash.
export function s3PublicBase(): string {
  const configured = requireEnv('S3_PUBLIC_BASE_URL').replace(/\/+$/, '')
  // Same stale-origin guard as lib/base-url.ts, because this value gets BAKED
  // INTO STORED ROWS: on 2026-09-02 a localhost value on production wrote
  // http://localhost:3000/api/media/... into analyses.frame_urls/video_url,
  // giving app users blank frames (see migrate-repair-localhost-media.sql).
  // A dev/test runtime keeps its localhost value; production never does.
  const stale =
    configured.includes('localhost') ||
    configured.includes('127.0.0.1') ||
    configured.includes('.vercel.app')
  if (stale && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return `${resolveBaseUrl()}/api/media`
  }
  return configured
}

// Map a stored URL back to its object key. Only URLs under our own public base
// are ours; a legacy Vercel Blob URL (from before the migration) returns null
// so deleteObjects can safely skip it instead of erroring.
function keyFromUrl(url: string): string | null {
  const base = s3PublicBase()
  if (!url.startsWith(base + '/')) return null
  return url.slice(base.length + 1)
}

// --- Public seam --------------------------------------------------------------

export async function putObject(
  key: string,
  data: Buffer | Blob | string,
  opts?: { contentType?: string },
): Promise<PutResult> {
  if (DRIVER === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const body =
      data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data
    const s3 = await s3Client()
    await s3.send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        Body: body,
        ContentType: opts?.contentType,
      }),
    )
    return { url: `${s3PublicBase()}/${key}` }
  }

  // vercel
  const blob = await put(key, data, {
    access: 'public',
    contentType: opts?.contentType,
  })
  return { url: blob.url }
}

export async function deleteObjects(urls: string | string[]): Promise<void> {
  const list = Array.isArray(urls) ? urls : [urls]
  if (list.length === 0) return

  if (DRIVER === 's3') {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const s3 = await s3Client()
    const bucket = s3Bucket()
    const keys = list.map(keyFromUrl).filter((k): k is string => !!k)
    await Promise.all(
      keys.map((Key) =>
        s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
      ),
    )
    return
  }

  // vercel
  await del(list)
}

export function storageDriver(): string {
  return DRIVER
}
