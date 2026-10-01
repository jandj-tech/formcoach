/**
 * What counts as a video we will accept. Client and server agree on this list.
 *
 * The browser's `file.type` is NOT enough: Windows reports an empty type for
 * any container it has no registered player for (.mkv, .wmv, .mts, .3gp…), and
 * an `accept="video/*"` picker hides those files entirely. Decoding happens
 * server-side with ffmpeg when the browser cannot, so anything ffmpeg demuxes
 * is fair game — the extension list here is what the pickers and the storage
 * gate let through; ffmpeg decides for real by looking at the bytes.
 */
export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mov', 'qt', 'webm', 'mkv', 'avi', 'wmv', 'asf', 'flv', 'f4v',
  '3gp', '3g2', 'mts', 'm2ts', 'ts', 'mpg', 'mpeg', 'mpe', 'm2v', 'vob', 'ogv',
  'ogg', 'mxf', 'divx', 'dv', 'hevc', 'h265', 'h264', '264', 'y4m', 'rm', 'rmvb',
] as const

/** Value for `<input accept>`: the MIME wildcard plus every explicit extension. */
export const VIDEO_ACCEPT = ['video/*', ...VIDEO_EXTENSIONS.map((e) => `.${e}`)].join(',')

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function hasVideoExtension(name: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(fileExtension(name))
}

/** True for anything the browser calls a video OR anything with a video extension. */
export function isVideoFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('video/') || hasVideoExtension(file.name)
}
