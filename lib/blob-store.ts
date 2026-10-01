/**
 * Which Vercel Blob store is OURS.
 *
 * Every Blob store serves from `<store-id>.public.blob.vercel-storage.com`,
 * so a hostname check against the shared suffix accepts every tenant's store
 * — anyone could point /api/extract-frames at a file in their own free store.
 * The read-write token names the store (`vercel_blob_rw_<STOREID>_<secret>`),
 * so the exact host is derived from it and nothing else is accepted.
 */

export const UPLOAD_PREFIX = 'videos/'

export function blobStoreHost(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN || ''
  const m = token.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)
  return m ? `${m[1].toLowerCase()}.public.blob.vercel-storage.com` : null
}

/** True only for an https URL under our own store and our upload prefix. */
export function isOurUploadedVideoUrl(raw: string): boolean {
  const host = blobStoreHost()
  if (!host) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname === host && url.pathname.startsWith(`/${UPLOAD_PREFIX}`)
}
