'use client'

import { upload } from '@vercel/blob/client'
import {
  extractFrames,
  UndecodableVideoError,
  type ExtractOptions,
} from '@/lib/frame-extraction'

/**
 * Frames from ANY video: in the browser when it can decode the file, on the
 * server (ffmpeg) when it cannot.
 *
 * Both uploaders used to call extractFrames() directly and show "Could not
 * read this video" the moment the browser lacked the codec — which is every
 * default iPhone clip (HEVC) opened on a Windows PC. This wrapper tries the
 * browser first because it is free and fast, and on an UndecodableVideoError
 * pushes the original straight to Vercel Blob (browser → store, no 4.5MB
 * function limit in the way) and asks /api/extract-frames for the same 28
 * frames. The caller then posts them to /api/analyze exactly as before.
 */

export type ExtractPhase = 'browser' | 'uploading' | 'server'

export interface AnywhereOptions extends ExtractOptions {
  /** Which machine is doing the work right now, for status text. */
  onPhase?: (phase: ExtractPhase) => void
  abortSignal?: AbortSignal
}

export interface AnywhereResult {
  frames: Blob[]
  /** Set when the original was uploaded for server decoding — pass it on to /api/analyze. */
  videoUrl: string | null
  /** True when the server had to cut resolution to fit the frames in a response. */
  reduced: boolean
  viaServer: boolean
}

// Matches the single uploader's own sanity cap and /api/upload-video's
// server-extract ceiling.
const SERVER_EXTRACT_MAX_BYTES = 1024 * 1024 * 1024

export async function extractFramesAnywhere(file: File, opts: AnywhereOptions = {}): Promise<AnywhereResult> {
  opts.onPhase?.('browser')
  try {
    const frames = await extractFrames(file, opts)
    return { frames, videoUrl: null, reduced: false, viaServer: false }
  } catch (err) {
    if (!(err instanceof UndecodableVideoError)) throw err
    if (opts.isCancelled?.()) throw err
    console.log('[extract] browser cannot decode this file, sending it to the server:', err.message)
  }

  if (file.size > SERVER_EXTRACT_MAX_BYTES) {
    throw new Error('Video must be under 1GB. Try trimming the clip to just the shot.')
  }

  // --- 1. Original → Blob, directly from the browser ---------------------------
  opts.onPhase?.('uploading')
  opts.onProgress?.(0)
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const pathname = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  let blob: Awaited<ReturnType<typeof upload>>
  try {
    blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/upload-video',
    clientPayload: JSON.stringify({ teamCode: opts.teamCode ?? null, purpose: 'server-extract' }),
    contentType: file.type || 'application/octet-stream',
    // Parallel parts with retries; the originals here are often hundreds of MB.
    multipart: file.size > 50 * 1024 * 1024,
    abortSignal: opts.abortSignal,
    // Upload is the first 30 points of the 0-65 extraction share.
    onUploadProgress: ({ percentage }) => opts.onProgress?.(Math.round(percentage * 0.3)),
    })
  } catch (err) {
    if (opts.abortSignal?.aborted || opts.isCancelled?.()) throw err
    const text = err instanceof Error ? err.message : String(err)
    if (/Login required/i.test(text)) {
      throw new Error('Your login has expired, so the video could not be uploaded. Refresh the page, sign in again, and try again.')
    }
    if (/too large/i.test(text)) {
      throw new Error('This video is over 1GB, which is too large to upload. Trim it to just the shot and try again.')
    }
    if (/Too many uploads/i.test(text)) {
      throw new Error('You have uploaded a lot of videos in the last hour and hit our limit. Wait an hour and try again.')
    }
    if (/Only video files/i.test(text)) {
      throw new Error('This file does not look like a video to us. Make sure it is the clip itself, not a photo or a link to one.')
    }
    throw new Error(
      `This browser can’t play this video format, so we tried to send the full video to our server — but the upload did not finish (${text}). Check your internet connection and try again.`,
    )
  }
  if (opts.isCancelled?.()) throw new Error('Cancelled')

  // --- 2. Server decodes, we get the frames back ------------------------------
  opts.onPhase?.('server')
  opts.onProgress?.(32)
  const res = await fetch('/api/extract-frames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: blob.url, teamCode: opts.teamCode ?? null }),
    signal: opts.abortSignal,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
    // 422 carries a reason written for the coach: what is wrong with this
    // file and what to do about it. Everything else is on our side.
    if (res.status === 422 && body.detail) throw new Error(body.detail)
    if (res.status === 401) {
      throw new Error('Your login has expired, so our server would not read the video. Refresh the page, sign in again, and try again.')
    }
    if (res.status === 429) {
      throw new Error('Our server is busy reading other videos right now. Wait a minute and press Try again — nothing was charged.')
    }
    if (res.status === 504 || res.status === 408) {
      throw new Error('Our server ran out of time reading this video — it is very long or very high resolution. Trim it to just the shot, or record at 1080p, and try again.')
    }
    throw new Error(
      body.detail ||
        'Something went wrong on our server while reading this video. It is not your file — try again in a minute, and email support with the file name if it keeps happening.',
    )
  }
  let parsed: FramePayload
  try {
    parsed = parseFramePayload(await res.arrayBuffer())
  } catch (err) {
    throw new Error(
      `Our server read the video but the frames did not arrive intact (${err instanceof Error ? err.message : 'bad response'}). Check your connection and try again.`,
    )
  }
  opts.onProgress?.(65)

  // Previews, like the browser path produces, so the uploader's thumbnails
  // and strip still show the shot.
  if (opts.onPreviews) {
    try {
      opts.onPreviews(await Promise.all(parsed.frames.map(blobToDataUrl)))
    } catch {}
  }

  return { frames: parsed.frames, videoUrl: blob.url, reduced: parsed.reduced, viaServer: true }
}

interface FramePayload {
  frames: Blob[]
  reduced: boolean
}

/** Inverse of the layout /api/extract-frames writes: magic, header length, header JSON, frame bytes. */
export function parseFramePayload(buf: ArrayBuffer): FramePayload {
  const view = new DataView(buf)
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (magic !== 'LHFR') throw new Error('Unexpected response from the server')
  const headerLen = view.getUint32(4)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLen))) as {
    count: number
    sizes: number[]
    reduced: boolean
  }
  const frames: Blob[] = []
  let offset = 8 + headerLen
  for (const size of header.sizes) {
    frames.push(new Blob([new Uint8Array(buf, offset, size)], { type: 'image/jpeg' }))
    offset += size
  }
  if (frames.length !== header.count || frames.length === 0) {
    throw new Error('The server returned no frames for this video')
  }
  return { frames, reduced: !!header.reduced }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
